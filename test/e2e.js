/**
 * 端到端测试：启动 mock chat/completions 服务，跑一次完整 agent 循环，
 * 验证：工具调用 → 人工审批中断 → 批准续跑 → 最终文本输出。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createCodingAgent } from '../src/agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PORT = 3901;

// 1. 启动 mock 服务
const mock = spawn(process.execPath, [path.join(__dirname, 'mock-llm.js')], {
  env: { ...process.env, MOCK_PORT: String(MOCK_PORT) },
  stdio: ['ignore', 'inherit', 'inherit'],
});
await new Promise((r) => setTimeout(r, 800));

const results = { toolCalls: [], approvalRequested: false, finalText: '', textDeltas: 0 };

try {
  // 2. 创建 agent，指向 mock 服务
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-e2e-'));
  fs.writeFileSync(path.join(ws, 'demo.txt'), 'hello');
  const cfg = loadConfig({
    baseURL: `http://localhost:${MOCK_PORT}/v1`,
    apiKey: 'sk-test',
    model: 'mock-model',
    workspace: ws,
  });
  const { agent, runner } = createCodingAgent(cfg);

  async function consume(stream) {
    for await (const event of stream) {
      if (event.type === 'raw_model_stream_event' && event.data?.type === 'output_text_delta') {
        results.finalText += event.data.delta;
        results.textDeltas++;
      } else if (event.type === 'run_item_stream_event' && event.name === 'tool_called') {
        results.toolCalls.push(event.item?.rawItem?.name);
        console.log(`[e2e] 工具调用: ${event.item?.rawItem?.name}(${event.item?.rawItem?.arguments})`);
      } else if (event.type === 'run_item_stream_event' && event.name === 'tool_output') {
        console.log(`[e2e] 工具输出: ${String(event.item?.output ?? '').split('\n')[0]}`);
      }
    }
    await stream.completed;
  }

  // 3. 运行
  let stream = await runner.run(agent, [{ role: 'user', content: '看看目录然后跑一下命令' }], {
    stream: true,
    maxTurns: 10,
  });
  await consume(stream);

  // 4. 审批循环（自动批准，模拟用户点"允许"）
  while ((stream.interruptions ?? []).length > 0) {
    for (const intr of stream.interruptions) {
      results.approvalRequested = true;
      console.log(`[e2e] 审批请求: ${intr.rawItem?.name}(${intr.rawItem?.arguments}) → 批准`);
      stream.state.approve(intr);
    }
    stream = await runner.run(agent, stream.state, { stream: true, maxTurns: 10 });
    await consume(stream);
  }

  // 5. 断言
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`断言失败: ${msg}`);
    console.log(`[e2e] ✓ ${msg}`);
  };
  assert(results.toolCalls.includes('list_dir'), '模型发起了 list_dir 工具调用');
  assert(results.toolCalls.includes('run_command'), '模型发起了 run_command 工具调用');
  assert(results.approvalRequested, 'run_command 触发了人工审批中断');
  assert(results.textDeltas > 1, '收到了流式文本增量');
  assert(results.finalText.includes('任务完成'), `最终回复正确（"${results.finalText}"）`);
  console.log('\n[e2e] 全部通过 ✅  完整链路：chat/completions 流式 → 工具调用 → 审批中断 → 续跑 → 文本输出');
} catch (e) {
  console.error(`\n[e2e] 测试失败 ❌ ${e.stack}`);
  process.exitCode = 1;
} finally {
  mock.kill();
}
