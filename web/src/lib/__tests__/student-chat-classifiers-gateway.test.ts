/**
 * 篇目归属 / 布鲁姆判定对"只正常服务 SSE 的模型网关"的契约测试。
 *
 * 背景（2026-09-11 生产事故）：dots3-note-prev 网关对非流式补全请求返回的
 * 响应体无法通过 JSON 解析，generateObject 直接抛 APICallError
 * "Invalid JSON response"，导致"孔雀东南飞"首问被降级进日常会话归档
 * （app_log_events: project_classification_fallback, request api_2c9b422f）。
 *
 * 本夹具模拟同一故障面：stream:true 走标准 Anthropic SSE；否则返回非 JSON 体。
 * 任何分类函数只要还走非流式 JSON，就会在这个网关上挂掉。
 */

import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { createAnthropic } from '@ai-sdk/anthropic';

import { classifyBloomLevel, classifyProjectFromQuestion } from '../student-chat-classifiers.ts';

type RecordedRequest = { stream: boolean | undefined; system: string; path: string };

const PROJECT_ANSWER = '孔雀东南飞\n佚名';
const BLOOM_ANSWER = '4\n需要比较叙事诗与抒情诗的文本特征并拆解结构关系';

/** 按 Anthropic messages 协议编排最小可解析的 SSE 事件序列。 */
function sseEvents(text: string): string {
  const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  return [
    event('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_fixture',
        type: 'message',
        role: 'assistant',
        model: 'fixture',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 16, output_tokens: 1 },
      },
    }),
    event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }),
    event('content_block_stop', { type: 'content_block_stop', index: 0 }),
    event('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } }),
    event('message_stop', { type: 'message_stop' }),
  ].join('');
}

function systemText(value: unknown): string {
  // SDK 发出的 system 是内容块数组（[{type:'text',text:...}]），归一成纯文本再匹配。
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((block) => (block && typeof block === 'object' && 'text' in block ? String((block as { text: unknown }).text) : ''))
      .join('\n');
  }
  return '';
}

function streamTextForRequest(system: string): string {
  if (system.includes('布鲁姆认知路径判定器')) return BLOOM_ANSWER;
  if (system.includes('篇目归属裁决器')) return PROJECT_ANSWER;
  return '好的，我们来一起看这个问题。';
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function handleGatewayRequest(req: IncomingMessage, res: ServerResponse, recorded: RecordedRequest[]): Promise<void> {
  return readBody(req).then((raw) => {
    let parsed: { stream?: boolean; system?: string } = {};
    try {
      parsed = JSON.parse(raw) as { stream?: boolean; system?: string };
    } catch {
      // 非 JSON 请求体：按非流式分支处理，网关同样拒绝。
    }
    recorded.push({ stream: parsed.stream, system: systemText(parsed.system), path: req.url ?? '/' });

    if (parsed.stream !== true) {
      // 模拟只讲 SSE 的网关：非流式补全返回非 JSON 体（真实网关行为导致
      // safeParseJSON 失败 → APICallError "Invalid JSON response"）。
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('non-streaming completion is not supported by this gateway');
      return;
    }

    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sseEvents(streamTextForRequest(systemText(parsed.system))));
  });
}

describe('student classifiers against an SSE-only gateway', () => {
  let server: Server;
  let baseUrl: string;
  let recorded: RecordedRequest[];

  before(async () => {
    recorded = [];
    server = createServer((req, res) => {
      void handleGatewayRequest(req, res, recorded).catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const gatewayModel = () => createAnthropic({ apiKey: 'fixture-key', baseURL: baseUrl })('fixture-model');

  it('归档案例回归：孔雀东南飞首问经 SSE 流式归属到篇目', async () => {
    const outcome = await classifyProjectFromQuestion(
      gatewayModel(),
      '孔雀东南飞 是叙事诗还是抒情诗',
      // 已有项目标题不含该篇目，强制走模型裁决，复现生产请求形态。
      ['静夜思', '赤壁赋'],
    );
    assert.equal(outcome.title, '孔雀东南飞');
    assert.equal(outcome.author, '佚名');
  });

  it('篇目归属请求必须走流式补全', async () => {
    const countBefore = recorded.length;
    await classifyProjectFromQuestion(gatewayModel(), '登高这首诗讲什么', []);
    const projectRequests = recorded.slice(countBefore);
    assert.equal(projectRequests.length, 1);
    assert.equal(projectRequests[0].stream, true);
    assert.equal(projectRequests[0].path, '/v1/messages');
  });

  it('布鲁姆判定在只讲 SSE 的网关上能拿到层级', async () => {
    const bloom = await classifyBloomLevel(gatewayModel(), '孔雀东南飞 是叙事诗还是抒情诗');
    assert.equal(bloom.level, 4);
    assert.ok(bloom.reason.length > 0);
  });

  it('布鲁姆判定请求必须走流式补全', async () => {
    const countBefore = recorded.length;
    await classifyBloomLevel(gatewayModel(), '静夜思表达了什么情感');
    const bloomRequests = recorded.slice(countBefore);
    assert.equal(bloomRequests.length, 1);
    assert.equal(bloomRequests[0].stream, true);
  });
});
