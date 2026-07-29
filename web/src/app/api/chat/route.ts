import { createAiSdkUiMessageStreamResponse } from '@openai/agents-extensions/ai-sdk-ui';
import { run, type RunStreamEvent } from '@openai/agents';
import { createCodingAgent } from '@/lib/agent';
import { toAgentInput } from '@/lib/messageConverters';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const sessionId = body.sessionId ?? body.id ?? 'default';

    // MVP 阶段：未开启自动审批时临时开启，避免流因等待审批而挂起
    const prevAutoApprove = process.env.SUPERAGENT_AUTO_APPROVE_SHELL;
    process.env.SUPERAGENT_AUTO_APPROVE_SHELL = 'true';

    // 创建 agent
    const { agent, cfg } = createCodingAgent();
    process.env.SUPERAGENT_AUTO_APPROVE_SHELL = prevAutoApprove;

    // 转换消息格式
    const input = toAgentInput(messages);

    // 运行 agent（streaming 模式）
    const result = await run(agent, input, {
      stream: true,
      maxTurns: cfg.maxTurns,
    });

    return createAiSdkUiMessageStreamResponse(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api/chat] POST error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
