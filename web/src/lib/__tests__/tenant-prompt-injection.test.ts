import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildChallengeEvaluationPrompt, buildChallengeGenerationPrompt } from '../challenge-prompts.ts';
import { buildStudentSystemPrompt, type StudentSystemPromptContext } from '../student-chat-prompts.ts';

/**
 * 三段提示词的租户指令通道。
 *
 * 断的是同一个不变量：租户写的是**内容**，平台规则是**协议**。
 * 通道做成「追加在平台协议之前」，所以「协议还在不在」必须可验证——
 * 一旦哪天改成整段替换，这里会先红。
 */

const GENERATION_CTX = {
  projectName: '一次函数',
  projectSubtitle: null,
  targetBloomLevel: 3,
  priorQuestions: [{ bloom_level: 2, content: '怎么判断两个函数交点？' }],
};

const EVALUATION_CTX = {
  projectName: '一次函数',
  projectSubtitle: null,
  targetBloomLevel: 2,
  challengePrompt: '把两个式子相等列出来，解出 x。',
  studentAnswer: '令 -2x+3 = x+1，解得 x = 2/3。',
};

const TENANT = '本空间统一用分数表示结果，先写式子再化简。';

test('挑战出题：租户指令在平台协议之前，平台规则一条不少', () => {
  const prompt = buildChallengeGenerationPrompt({ ...GENERATION_CTX, tenantInstruction: TENANT });

  assert.ok(prompt.indexOf(TENANT) < prompt.indexOf('你是文韵智途的挑战出题助手'), '租户指令必须排在平台协议之前');
  assert.match(prompt, /只出 1 道题/, '平台出题规则必须保留');
  assert.match(prompt, /不得提高、降低或跳过目标层级/, '目标层级约束必须保留');
  assert.match(prompt, /<untrusted_student_questions>/, '不可信内容沙盒必须保留');
});

test('挑战评阅：租户指令在平台协议之前，通过/未通过与沙盒都保留', () => {
  const prompt = buildChallengeEvaluationPrompt({ ...EVALUATION_CTX, tenantInstruction: TENANT });

  assert.ok(prompt.indexOf(TENANT) < prompt.indexOf('你是文韵智途的挑战确认助手'), '租户指令必须排在平台协议之前');
  assert.match(prompt, /结果只有通过 \/ 未通过/);
  assert.match(prompt, /<untrusted_student_answer>/);
});

test('挑战提示词：不传租户指令时与从前逐字一致', () => {
  // 出题与评阅是两个不同签名的函数。放进同一个元组循环后 TS 会把 ctx 求成
  // 两个 context 的**交集**，于是两边的调用都报错——分开写，类型才对。
  const generationOmitted = buildChallengeGenerationPrompt(GENERATION_CTX);
  assert.equal(
    buildChallengeGenerationPrompt({ ...GENERATION_CTX, tenantInstruction: null }),
    generationOmitted,
    '出题：null 应与省略等价',
  );
  assert.equal(
    buildChallengeGenerationPrompt({ ...GENERATION_CTX, tenantInstruction: '   ' }),
    generationOmitted,
    '出题：空白指令不应产生噪声',
  );

  const evaluationOmitted = buildChallengeEvaluationPrompt(EVALUATION_CTX);
  assert.equal(
    buildChallengeEvaluationPrompt({ ...EVALUATION_CTX, tenantInstruction: null }),
    evaluationOmitted,
    '评阅：null 应与省略等价',
  );
  assert.equal(
    buildChallengeEvaluationPrompt({ ...EVALUATION_CTX, tenantInstruction: '   ' }),
    evaluationOmitted,
    '评阅：空白指令不应产生噪声',
  );

  for (const prompt of [generationOmitted, evaluationOmitted]) {
    assert.doesNotMatch(prompt, /本学校\/本空间的教学要求/, '没有租户指令时不该留下这段抬头');
  }
});

test('学生会话：三种容器都能追加租户指令，且平台不变量保留', () => {
  const contexts: StudentSystemPromptContext[] = [
    { kind: 'project', projectTitle: '一次函数' },
    { kind: 'classifying' },
    { kind: 'archive' },
  ];

  for (const ctx of contexts) {
    const prompt = buildStudentSystemPrompt({ ...ctx, presetInstruction: TENANT });

    assert.ok(prompt.includes(TENANT), `${ctx.kind} 应带上租户指令`);
    assert.match(prompt, /AI 教学助手/, `${ctx.kind} 的角色描述必须保留`);
    assert.match(prompt, /每轮最多提出 1 个自然追问/, `${ctx.kind} 的教学骨架必须保留`);
  }
  assert.match(buildStudentSystemPrompt({ kind: 'project', projectTitle: '一次函数', presetInstruction: TENANT }), /不要声称已完成教师核实/);
});

test('学生会话：不传预设时与从前逐字一致', () => {
  const base: StudentSystemPromptContext = { kind: 'project', projectTitle: '一次函数' };

  assert.equal(buildStudentSystemPrompt({ ...base, presetInstruction: null }), buildStudentSystemPrompt(base));
  assert.equal(buildStudentSystemPrompt({ ...base, presetInstruction: '  ' }), buildStudentSystemPrompt(base));
  assert.doesNotMatch(buildStudentSystemPrompt(base), /本学校\/本空间的教学要求/);
});
