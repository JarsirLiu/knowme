import OpenAI from 'openai';
import {
  Agent,
  setDefaultOpenAIClient,
  setOpenAIAPI,
  setTracingDisabled,
} from '@openai/agents';
import { loadConfig, type AppConfig } from './config';
import { createTools } from './tools';

export interface CodingAgent {
  agent: Agent;
  client: OpenAI;
  cfg: AppConfig;
}

/**
 * 创建 coding agent。
 * 关键点：setOpenAIAPI('chat_completions') —— 只走 /chat/completions 协议，
 * 兼容 Ollama、vLLM、LM Studio、DeepSeek、通义等所有 OpenAI 兼容服务。
 */
export function createCodingAgent(): CodingAgent {
  const cfg = loadConfig();

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });

  // 全局设为 chat_completions 模式（不使用 responses API）
  setDefaultOpenAIClient(client);
  setOpenAIAPI('chat_completions');
  setTracingDisabled(true); // 本地模型无需上传 trace

  const tools = createTools(cfg);

  const agent = new Agent({
    name: 'SuperAgent',
    model: cfg.model,
    instructions: [
      '你是一个本地 coding agent，工作目录是 ' + cfg.workspace + '（Windows 系统）。',
      '你可以使用工具读写文件、搜索代码、执行 shell 命令来完成用户的编程任务。',
      '',
      '工作准则：',
      '1. 修改代码前先用 read_file / grep / glob 了解现状，不要凭空猜测文件内容。',
      '2. 小改动用 edit_file 精确替换；新文件或整体重写用 write_file。',
      '3. 所有文件路径使用相对于工作目录的相对路径。',
      '4. 执行命令后检查输出，出错要分析并修复。',
      '5. 完成任务后简要总结改动了哪些文件、做了什么。',
      '6. 用中文回复用户。',
    ].join('\n'),
    tools,
  });

  return { agent, client, cfg };
}
