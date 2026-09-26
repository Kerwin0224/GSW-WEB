import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

import { csvCell, toCsv } from '../portability-csv.ts';

const read = (rel: string) => readFileSync(resolve(new URL('../../', import.meta.url).pathname, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const studentData = read('lib/data/student.ts');
const studentPage = read('app/student/page.tsx');
const chatClient = read('components/workbench/student-chat-client.tsx');
const teacherPage = read('app/teacher/page.tsx');
const studentExportRoute = read('app/api/exports/portability/student/route.ts');
const teacherExportRoute = read('app/api/exports/portability/teacher/route.ts');
const portabilityExport = read('lib/portability-export.ts');

/**
 * 这一批断言覆盖的都是「数据在库里、界面上却拿不到」和「数字看起来可信、其实被采样或被口径骗了」。
 * 它们不会抛异常：截断只会让学期末的历史检索失效，采样只会让教师低核实进度。
 * 所以把「不许静默截断 / 不许拿样本冒充总数」写成可执行判据。
 */

test('学生历史会话不得静默截断，且必须带精确计数', () => {
  assert.doesNotMatch(studentData, /\.limit\(8\)/, '日常会话归档不得再截断到 8 条');
  assert.doesNotMatch(studentData, /\.slice\(0, 5\)/, '项目内会话不得再截断到 5 条');
  // count: 'exact' + range：总数与翻页才对得上，「共 N 条」才不是猜的。
  assert.match(studentData, /count: 'exact'/, '会话历史查询必须取精确计数');
  assert.match(studentData, /\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/, '会话历史必须按页取');
  assert.match(studentData, /ilike\('title'/, '会话检索必须落到服务端过滤');
  // 界面必须给出翻页与搜索入口，否则总数再准也翻不到第二页。
  assert.match(chatClient, /<Pagination[\s\S]*?history\.total/, '侧栏必须按总数分页');
  assert.match(chatClient, /name="q"/, '侧栏必须有检索框');
  assert.match(studentPage, /getStudentWorkspace\(\{ spaceId: activeSpaceId, q: historyQuery, page: historyPage \}\)/, '检索词与页码必须走 URL 参数');
});

test('「尚未通过」只统计挑战过但没通过的项目', () => {
  // highest_bloom_level 是缓存列，从没挑战过的项目同样是 null：
  // 学期初用它计数会让每个学生看到一片红，学期中它也可能与挑战记录不同步。
  assert.match(studentData, /attemptedProjectIds\.has\(row\.id\) && !confirmedProjectIds\.has\(row\.id\)/, '「尚未通过」必须由挑战记录判定');
  assert.doesNotMatch(studentData, /awaitingChallengeCount: projectRows\.filter\(\(row\) => row\.highest_bloom_level === null\)/, '不得再用缓存列直接计数');
});

test('导出端点是 owner 或 admin 双路，学生路径拿不到别人的数据', () => {
  assert.match(studentExportRoute, /requireAnyRole\(\['student', 'admin', 'org_admin'\]\)/, '角色门必须同时放开学生与管理员');
  assert.match(studentExportRoute, /role\.data\.role === 'student'[\s\S]*?role\.data\.id/, '学生路径必须把 owner 钉成自己');
  assert.match(studentExportRoute, /管理员代取需要指定 owner/, '管理员代取必须显式指定 owner');
  assert.match(teacherExportRoute, /requireRole\('teacher'\)/, '教师导出只对教师开放');
  // 已删除的会话不得被导出绕回来（产品语义是删除）。
  assert.match(portabilityExport, /deleted_at === null/, '教师导出必须剔除已删除会话');
  // 会话正文相关查询必须翻页取尽，否则导出是「看起来导完了其实少一半」。
  assert.match(portabilityExport, /async function fetchAll<T>/, '导出查询必须翻页取尽');
});

test('看板两个总数用精确计数，不再用 500 条样本冒充', () => {
  assert.match(teacherPage, /auditResult\.data\.pendingTotal/, '待核实会话必须用队列的精确总数');
  assert.match(teacherPage, /auditResult\.data\.finalizedTotal/, '已核实会话必须用队列的精确总数');
  assert.doesNotMatch(teacherPage, /const reviewedCount = analytics\.reviewedCount/, '不得直接用采样的 reviewedCount');
  // 仍在采样的那一项（近 7 天覆盖）必须在界面上写明口径。
  assert.match(teacherPage, /最近 500 条 AI 回答/, '采样项必须写明样本口径');
});

test('学段分组：无行政班的会话也要有归属', () => {
  assert.match(teacherPage, /'无行政班'/, '没有行政班的会话必须有自己的分组');
  assert.match(teacherPage, /stageByClassId/, '班级分组必须带学段');
  assert.match(read('lib/data/class-stages.ts'), /classes\(id,name,stage\)/, '学段取自 classes.stage');
});

test('CSV 单元格转义：带逗号/引号/换行的正文不能把列冲歪', () => {
  assert.equal(csvCell('他说,这样可以吗'), '"他说,这样可以吗"');
  assert.equal(csvCell('他说"好"'), '"他说""好"""');
  assert.equal(csvCell('第一行\n第二行'), '"第一行\n第二行"');
  assert.equal(csvCell(null), '');
  const csv = toCsv(['项目', '通过'], [['一次函数, 专题', '是']]);
  assert.ok(csv.startsWith('﻿'), 'CSV 必须带 BOM，否则 Excel 里中文是乱码');
  assert.equal(csv, '﻿项目,通过\r\n"一次函数, 专题",是\r\n');
});
