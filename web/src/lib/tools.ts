import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { tool } from '@openai/agents';
import { z } from 'zod';

/** 将相对路径解析到 workspace 内，并阻止越界访问 */
function resolveSafe(workspace: string, p: string): string {
  const abs = path.resolve(workspace, p);
  const rel = path.relative(workspace, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界：${p} 不在工作目录 ${workspace} 内`);
  }
  return abs;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
]);

function walk(
  dir: string,
  workspace: string,
  results: string[],
  opts: { limit: number; pattern: RegExp | null },
): void {
  if (results.length >= opts.limit) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (results.length >= opts.limit) return;
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      walk(path.join(dir, e.name), workspace, results, opts);
    } else if (e.isFile()) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(workspace, abs).replace(/\\/g, '/');
      if (!opts.pattern || opts.pattern.test(rel)) results.push(rel);
    }
  }
}

/** 简易 glob → 正则 */
function globToRegex(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${esc}$`, 'i');
}

export function createTools(cfg: {
  workspace: string;
  autoApproveShell: boolean;
}): ReturnType<typeof tool>[] {
  const ws = cfg.workspace;

  const listDir = tool({
    name: 'list_dir',
    description:
      '列出工作目录下某个子目录的文件和文件夹。path 为相对路径，"." 表示根目录。',
    parameters: z.object({
      path: z.string().describe('相对路径，如 "." 或 "src"'),
    }),
    execute: async ({ path: p }) => {
      const abs = resolveSafe(ws, p);
      const entries = fs.readdirSync(abs, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return lines.length ? lines.join('\n') : '(空目录)';
    },
  });

  const readFile = tool({
    name: 'read_file',
    description: '读取文件内容（带行号）。大文件可用 offset/limit 分页读取。',
    parameters: z.object({
      path: z.string().describe('文件相对路径'),
      offset: z.coerce.number().int().min(1).nullable().optional().describe('起始行号（从 1 开始），不传表示从头'),
      limit: z.coerce.number().int().min(1).nullable().optional().describe('最多读取行数，不传表示默认 500 行'),
    }),
    execute: async ({ path: p, offset, limit }) => {
      const abs = resolveSafe(ws, p);
      const content = fs.readFileSync(abs, 'utf8');
      const lines = content.split(/\r?\n/);
      const start = (offset ?? 1) - 1;
      const n = limit ?? 500;
      const slice = lines.slice(start, start + n);
      const numbered = slice
        .map((l, i) => `${start + i + 1}→${l}`)
        .join('\n');
      const more =
        start + n < lines.length ? `\n... (共 ${lines.length} 行，已截断)` : '';
      return numbered + more;
    },
  });

  const writeFile = tool({
    name: 'write_file',
    description: '创建或覆盖写入文件（自动创建父目录）。',
    parameters: z.object({
      path: z.string().describe('文件相对路径'),
      content: z.string().describe('完整文件内容'),
    }),
    execute: async ({ path: p, content }) => {
      const abs = resolveSafe(ws, p);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      return `已写入 ${p}（${content.length} 字符）`;
    },
  });

  const editFile = tool({
    name: 'edit_file',
    description:
      '对文件做精确字符串替换。old_string 必须在文件中唯一存在（除非 replace_all 为 true）。',
    parameters: z.object({
      path: z.string(),
      old_string: z.string().describe('要被替换的原文，必须与文件内容完全一致'),
      new_string: z.string().describe('替换后的新文本'),
      replace_all: z.boolean().nullable().optional().describe('是否替换所有匹配，默认 false'),
    }),
    execute: async ({ path: p, old_string, new_string, replace_all }) => {
      const abs = resolveSafe(ws, p);
      const content = fs.readFileSync(abs, 'utf8');
      const count = content.split(old_string).length - 1;
      if (count === 0) throw new Error(`old_string 在 ${p} 中未找到`);
      if (count > 1 && !replace_all) {
        throw new Error(
          `old_string 在 ${p} 中出现 ${count} 次，请提供更长的唯一上下文或设置 replace_all`,
        );
      }
      const next = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);
      fs.writeFileSync(abs, next, 'utf8');
      return `已修改 ${p}（替换 ${replace_all ? count : 1} 处）`;
    },
  });

  const globTool = tool({
    name: 'glob',
    description:
      '按 glob 模式查找文件，如 "src/**/*.ts"、"*.json"。自动忽略 node_modules/.git 等目录。',
    parameters: z.object({ pattern: z.string() }),
    execute: async ({ pattern }) => {
      const results: string[] = [];
      walk(ws, ws, results, { limit: 200, pattern: globToRegex(pattern) });
      return results.length ? results.join('\n') : '(无匹配文件)';
    },
  });

  const grep = tool({
    name: 'grep',
    description:
      '在工作目录所有文本文件中按正则搜索内容，返回 文件:行号:内容。',
    parameters: z.object({
      pattern: z.string().describe('JavaScript 正则表达式'),
      glob: z.string().nullable().optional().describe('可选，限定文件范围的 glob，如 "**/*.js"'),
    }),
    execute: async ({ pattern, glob }) => {
      const re = new RegExp(pattern);
      const files: string[] = [];
      walk(ws, ws, files, {
        limit: 2000,
        pattern: glob ? globToRegex(glob) : null,
      });
      const hits: string[] = [];
      for (const rel of files) {
        if (hits.length >= 100) break;
        let content;
        try {
          content = fs.readFileSync(path.join(ws, rel), 'utf8');
        } catch {
          continue;
        }
        if (content.includes('\u0000')) continue; // 跳过二进制
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length && hits.length < 100; i++) {
          if (re.test(lines[i]))
            hits.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 200)}`);
        }
      }
      return hits.length ? hits.join('\n') : '(无匹配)';
    },
  });

  const runCommand = tool({
    name: 'run_command',
    description:
      '在工作目录中执行 shell 命令（Windows 上为 cmd）。用于运行测试、安装依赖、git 操作等。输出会被截断到 8000 字符。危险操作需人工审批。',
    parameters: z.object({
      command: z.string().describe('要执行的命令'),
      timeout_sec: z
        .coerce
        .number()
        .int()
        .min(1)
        .max(600)
        .nullable()
        .optional()
        .describe('超时秒数，默认 120'),
    }),
    needsApproval: async () => !cfg.autoApproveShell,
    execute: async ({ command, timeout_sec }) =>
      new Promise<string>((resolve) => {
        exec(
          command,
          {
            cwd: ws,
            timeout: (timeout_sec ?? 120) * 1000,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024,
          },
          (err, stdout, stderr) => {
            const out = [
              stdout && `stdout:\n${stdout}`,
              stderr && `stderr:\n${stderr}`,
              err && `exit: ${err.code ?? 'killed(timeout)'}`,
            ]
              .filter(Boolean)
              .join('\n');
            resolve((out || '(无输出，执行成功)').slice(0, 8000));
          },
        );
      }),
  });

  return [listDir, readFile, writeFile, editFile, globTool, grep, runCommand] as ReturnType<
    typeof tool
  >[];
}
