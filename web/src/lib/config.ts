import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// 配置统一从项目根目录的 .env 读取（不依赖当前工作目录）
loadDotenv({ path: path.resolve(process.cwd(), '..', '.env') });

export interface AppConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  workspace: string;
  autoApproveShell: boolean;
  maxTurns: number;
}

function getRequired(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(
    `缺少必填配置（${names.join(' / ')}），请在项目根目录 .env 中设置。可参考 .env.example。`,
  );
}

export function loadConfig(): AppConfig {
  const baseURL = getRequired('SUPERAGENT_BASE_URL', 'OPENAI_BASE_URL');
  const apiKey = getRequired('SUPERAGENT_API_KEY', 'OPENAI_API_KEY');
  const model = getRequired('SUPERAGENT_MODEL', 'OPENAI_MODEL');
  const workspace =
    process.env.SUPERAGENT_WORKSPACE || process.env.WORKSPACE || process.cwd();
  const autoApproveShell =
    (process.env.SUPERAGENT_AUTO_APPROVE_SHELL || 'false').toLowerCase() ===
    'true';
  const maxTurns = Number(process.env.SUPERAGENT_MAX_TURNS || '25') || 25;
  return { baseURL, apiKey, model, workspace, autoApproveShell, maxTurns };
}
