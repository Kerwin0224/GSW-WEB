import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProjectClassificationInstruction,
  defaultBloomClassificationInstruction,
  defaultProjectClassificationInstruction,
  matchKnownProjectTitle,
  parseBloomClassificationAnswer,
  parseClassificationAnswer,
} from '../classification-prompts.ts';

// ─── 回归：多标题时曾按长度挑，忽略学生先说哪个 ──────────────────────────────

test('matchKnownProjectTitle：取最早出现的标题，而非最长的', () => {
  const known = ['春望', '静夜思'];
  assert.equal(matchKnownProjectTitle('《春望》和《静夜思》比较一下', known), '春望');
  assert.equal(matchKnownProjectTitle('《静夜思》和《春望》比较一下', known), '静夜思');
});

test('matchKnownProjectTitle：同位置取更具体的标题', () => {
  const known = ['念奴娇', '念奴娇·赤壁怀古'];
  assert.equal(matchKnownProjectTitle('念奴娇·赤壁怀古上阕怎么理解', known), '念奴娇·赤壁怀古');
});

test('matchKnownProjectTitle：未命中或占位名返回 null', () => {
  assert.equal(matchKnownProjectTitle('今天天气不错', ['春望']), null);
  // 单字标题不参与匹配，避免噪音。
  assert.equal(matchKnownProjectTitle('这个人是谁', ['人']), null);
  assert.equal(matchKnownProjectTitle('日常会话归档在哪里', ['日常会话归档', '静夜思']), null);
  assert.equal(matchKnownProjectTitle('静夜思写得真好', []), null);
});

// ─── 归类输出解析 ────────────────────────────────────────────────────────────

test('parseClassificationAnswer：读两行，第二行是补充标识', () => {
  assert.deepEqual(parseClassificationAnswer('赤壁赋\n苏轼'), { title: '赤壁赋', author: '苏轼' });
  assert.deepEqual(parseClassificationAnswer('一次函数\n人教版八年级下'), { title: '一次函数', author: '人教版八年级下' });
  assert.deepEqual(parseClassificationAnswer('登高\n'), { title: '登高', author: null });
  assert.deepEqual(parseClassificationAnswer('念奴娇·赤壁怀古\n苏轼\n多余行忽略'), { title: '念奴娇·赤壁怀古', author: '苏轼' });
});

test('parseClassificationAnswer：NULL 与占位名判无法归属', () => {
  assert.deepEqual(parseClassificationAnswer('NULL'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('null'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('日常会话归档'), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer(''), { title: null, author: null });
  assert.deepEqual(parseClassificationAnswer('《登高》\n杜甫'), { title: '登高', author: '杜甫' });
});

test('parseClassificationAnswer：行首标签前缀可被剥掉', () => {
  assert.deepEqual(parseClassificationAnswer('篇目：出塞\n王昌龄'), { title: '出塞', author: '王昌龄' });
  assert.deepEqual(parseClassificationAnswer('项目：一次函数'), { title: '一次函数', author: null });
  assert.deepEqual(parseClassificationAnswer('主题：勾股定理'), { title: '勾股定理', author: null });
});

test('parseClassificationAnswer：从散文里捞书名号，捞不到就判无法归属', () => {
  // 小模型不守两行协议、把整段回答当首行输出时的生产失败形态（秦时明月汉时关案）。
  const prose = '这句诗运用了互文的修辞手法。它出自王昌龄的《出塞》，前两句是秦时明月汉时关。';
  assert.deepEqual(parseClassificationAnswer(prose), { title: '出塞', author: null });
  assert.deepEqual(parseClassificationAnswer('这句诗运用了比喻和夸张的修辞手法，表达了戍边将士的思乡之情。'), { title: null, author: null });
});

// ─── 布鲁姆输出解析 ──────────────────────────────────────────────────────────

test('parseBloomClassificationAnswer：读层级与理由', () => {
  assert.deepEqual(parseBloomClassificationAnswer('4\n需要比较两种文体的特征'), { level: 4, reason: '需要比较两种文体的特征' });
  assert.deepEqual(parseBloomClassificationAnswer('2'), { level: 2, reason: '' });
});

test('parseBloomClassificationAnswer：容忍非数字前缀', () => {
  assert.deepEqual(parseBloomClassificationAnswer('第4层\n拆解结构'), { level: 4, reason: '拆解结构' });
  assert.deepEqual(parseBloomClassificationAnswer('层级：6\n生成仿写'), { level: 6, reason: '生成仿写' });
});

test('parseBloomClassificationAnswer：编号序列与越界一律判解析失败', () => {
  assert.equal(parseBloomClassificationAnswer('2026\n年度总结'), null);
  assert.equal(parseBloomClassificationAnswer('12\n两个层级'), null);
  assert.equal(parseBloomClassificationAnswer('7\n超出范围'), null);
  assert.equal(parseBloomClassificationAnswer('0\n低于范围'), null);
  assert.equal(parseBloomClassificationAnswer('层级未知\n无法判断'), null);
  assert.equal(parseBloomClassificationAnswer(''), null);
});

test('parseBloomClassificationAnswer：理由超 120 字截断', () => {
  const parsed = parseBloomClassificationAnswer(`3\n${'理'.repeat(200)}`);
  assert.ok(parsed);
  assert.equal(parsed.reason.length, 120);
});

// ─── 归类提示词抽象：教师规则不破坏输出协议 ──────────────────────────────────

test('buildProjectClassificationInstruction：无教师规则时用内置规则，且只拼一次协议', () => {
  const text = buildProjectClassificationInstruction();
  assert.ok(text.includes(defaultProjectClassificationInstruction));
  const protocolCount = text.split('无法归属时只输出一行 NULL').length - 1;
  assert.equal(protocolCount, 1, '输出协议不应重复拼接');
});

test('buildProjectClassificationInstruction：教师规则覆盖内置，协议仍由系统强制带上', () => {
  const text = buildProjectClassificationInstruction({ teacherRules: [{ teacherName: '王老师', instruction: '本班按数学知识点归类。' }] });
  assert.ok(text.includes('本班按数学知识点归类。'));
  assert.ok(!text.includes(defaultProjectClassificationInstruction), '教师规则应覆盖内置规则');
  assert.ok(text.includes('无法归属时只输出一行 NULL'), '协议必须保留');
});

test('buildProjectClassificationInstruction：每师每班一条，多条规则并列带出', () => {
  const text = buildProjectClassificationInstruction({
    teacherRules: [
      { teacherName: '王老师', instruction: '语文按篇目归类。' },
      { teacherName: '李老师', instruction: '数学按知识点归类。' },
    ],
  });
  assert.ok(text.includes('【王老师】') && text.includes('语文按篇目归类。'));
  assert.ok(text.includes('【李老师】') && text.includes('数学按知识点归类。'));
  // 两条规则都在，由模型选用最贴合的一条；协议只拼一次。
  assert.equal(text.split('无法归属时只输出一行 NULL').length - 1, 1);
});

test('buildProjectClassificationInstruction：忽略空规则', () => {
  const text = buildProjectClassificationInstruction({ teacherRules: [{ teacherName: '王老师', instruction: '   ' }] });
  assert.ok(text.includes(defaultProjectClassificationInstruction), '空规则应退回内置默认');
});

// ─── 定位：系统做判断的提示词不假设学科 ──────────────────────────────────────
//
// 这个工作台服务各学科各年级。归类口径由教师提示词决定，内置默认只是兜底，
// 一旦它假设「这里教的是古诗文」，数学班的归类就会去谈意象与情感脉络。

test('内置归类口径不假设学科', () => {
  for (const forbidden of ['古诗文', '文言文', '篇目', '作者的作品']) {
    assert.ok(!defaultProjectClassificationInstruction.includes(forbidden), `内置归类口径不应出现「${forbidden}」`);
  }
});

test('内置布鲁姆口径不假设学科', () => {
  for (const forbidden of ['古诗文', '文言文', '诗句', '意象', '背诵诗句']) {
    assert.ok(!defaultBloomClassificationInstruction.includes(forbidden), `内置布鲁姆口径不应出现「${forbidden}」`);
  }
  // 六层语义本身保留。
  for (const level of ['1 记忆=', '2 理解=', '3 应用=', '4 分析=', '5 评价=', '6 创造=']) {
    assert.ok(defaultBloomClassificationInstruction.includes(level), `应保留 ${level}`);
  }
});

test('输出协议第二行是通用补充标识，不是「作者」', () => {
  const text = buildProjectClassificationInstruction();
  assert.ok(text.includes('项目的补充标识'), '应说明第二行是补充标识');
  assert.ok(!text.includes('第二行是作者或出处'), '不应把第二行写死成作者');
});
