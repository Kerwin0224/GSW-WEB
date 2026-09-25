import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const read = (...parts: string[]) => readFileSync(resolve(new URL('.', import.meta.url).pathname, ...parts), 'utf8');
const student = read('..', 'data', 'student.ts');
const chat = read('..', '..', 'app', 'api', 'student', 'chat', 'route.ts');
const page = read('..', '..', 'app', 'student', 'page.tsx');

test('学生工作区按空间读取项目和会话', () => {
  assert.match(student, /getStudentWorkspace\([^)]*spaceId[\s\S]*?\)/, '工作区查询必须接收空间作用域');
  assert.match(student, /getStudentProjects\([^)]*spaceId[\s\S]*?\)/, '项目查询必须接收空间作用域');
  assert.match(student, /\.eq\(['"]space_id['"],\s*spaceId\)/, '项目和会话查询必须按 space_id 过滤');
});

test('新项目和新会话继承当前空间', () => {
  assert.match(chat, /space_id:\s*spaceId/, '项目写入必须保存 space_id');
  assert.match(chat, /\.eq\(['"]space_id['"],\s*spaceId\)/, '项目查重必须限定在当前空间');
  assert.match(chat, /resolveProjectAssignment\([\s\S]*spaceId/, '项目识别必须把空间传入写入口');
});

test('学生页按当前空间装配首屏数据', () => {
  assert.match(page, /getStudentWorkspace\(\{[\s\S]*spaceId/, '学生页必须把空间传给工作区查询');
  assert.match(page, /getStudentProjects\(\{[\s\S]*spaceId/, '学生页必须把空间传给项目查询');
});
