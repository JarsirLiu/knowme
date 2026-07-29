/**
 * Mock OpenAI chat/completions 服务 —— 仅实现 /v1/chat/completions（流式 SSE）。
 * 用于端到端验证 agent 循环：
 *   第 1 轮（无 tool 消息）  → 返回 list_dir 工具调用
 *   第 2 轮（1 条 tool 消息）→ 返回 run_command 工具调用（触发人工审批）
 *   第 3 轮（2 条 tool 消息）→ 返回最终文本回答
 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 3901);

function chunk(res, delta, finish = null) {
  const payload = {
    id: 'chatcmpl-mock',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'mock-model',
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function streamToolCall(res, name, args) {
  chunk(res, { role: 'assistant', content: null });
  chunk(res, {
    tool_calls: [
      { index: 0, id: `call_${name}_${Date.now()}`, type: 'function', function: { name, arguments: '' } },
    ],
  });
  chunk(res, { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] });
  chunk(res, {}, 'tool_calls');
  res.write('data: [DONE]\n\n');
  res.end();
}

function streamText(res, text) {
  chunk(res, { role: 'assistant', content: '' });
  for (const piece of text.match(/.{1,8}/gs) ?? []) {
    chunk(res, { content: piece });
  }
  chunk(res, {}, 'stop');
  res.write('data: [DONE]\n\n');
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.includes('/chat/completions')) {
    res.writeHead(404).end('not found — mock 只支持 POST /v1/chat/completions');
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const payload = JSON.parse(body);
    const toolMsgs = (payload.messages ?? []).filter((m) => m.role === 'tool').length;
    console.log(`[mock] 收到请求：messages=${payload.messages.length}, tool 消息=${toolMsgs}, stream=${payload.stream}`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });

    if (toolMsgs === 0) {
      streamToolCall(res, 'list_dir', { path: '.' });
    } else if (toolMsgs === 1) {
      streamToolCall(res, 'run_command', { command: 'echo hello-from-mock', timeout_sec: null });
    } else {
      streamText(res, '任务完成：我查看了目录结构并执行了命令，一切正常。');
    }
  });
});

server.listen(PORT, () => console.log(`[mock] chat/completions 服务已启动: http://localhost:${PORT}/v1`));
