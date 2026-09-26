import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

import { newestFunctionBody } from './migration-source.ts';

/**
 * 这一批断言覆盖的全是「**失败时没有人被告知**」这一类缺陷。
 *
 * 它们没有类型错误、没有异常、没有红色日志：一条被 RLS 过滤掉的写入返回 0 行、
 * 一个被白名单漏掉的分支返回 undefined、一个只更新了列却没检查命中行的 update
 * 报"已保存"——界面照常刷新，下一个人接着在错误的状态上继续操作。
 * 租户边界与写时谓词又只写在 SQL 里，没有应用层兜底可依赖。
 * 所以把「不许静默」变成可执行的判据，改回去时它会拦住你。
 */

const dataDir = resolve(new URL('.', import.meta.url).pathname, '..', 'data');
const teacherActions = readFileSync(join(dataDir, 'teacher-actions.ts'), 'utf8');
const admin = readFileSync(join(dataDir, 'admin.ts'), 'utf8');
const spaces = readFileSync(join(dataDir, 'spaces.ts'), 'utf8');
const org = readFileSync(join(dataDir, 'org.ts'), 'utf8');

/** 切出某个导出函数的函数体（含下一个顶层声明之前的内容）。 */
function functionBody(source: string, name: string, nextName?: string) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `应能找到 ${name}`);
  const end = nextName ? source.indexOf(`export async function ${nextName}(`, start) : source.length;
  return source.slice(start, end < 0 ? source.length : end);
}

test('conversations 的空间归属判定只在归属列真的变化时执行', () => {
  const sql = newestFunctionBody('validate_conversation_space_contract');

  // 这是本条迁移的全部意义：归属没变时，"这是不是该学生自己空间里的记录"
  // 根本没被重新表述，用当前身份重判只会打死教师写 finalized_at 与学生软删会话。
  assert.match(sql, /v_scope_changed/, '归属判定必须挂在「归属是否变化」这个条件上');
  assert.match(sql, /new\.space_id is distinct from old\.space_id/, '必须盯 space_id');
  assert.match(sql, /new\.owner_id is distinct from old\.owner_id/, '必须盯 owner_id');
  assert.match(sql, /new\.source is distinct from old\.source/, '必须盯 source');

  // 写成 `tg_op = 'INSERT' or new.space_id is distinct from old.space_id` 会在插入路径上
  // 报 record "old" is not assigned yet：PL/pgSQL 交给 SQL 求值，而 SQL 不保证 OR 短路。
  assert.doesNotMatch(sql, /tg_op\s*=\s*'INSERT'\s+or\s+/, 'INSERT 分支必须用嵌套 if，不能靠 OR 短路');
  assert.match(sql, /if tg_op = 'INSERT' then/, '必须显式分支处理 INSERT');

  // 项目空间对齐是写时不变量，不能被这次收紧顺手删掉。
  assert.match(sql, /must match project space/, '会话与项目的空间一致性仍然必须钉住');
});

test('finalizeLearningConversation 用条件更新并检查命中行数', () => {
  const body = functionBody(teacherActions, 'finalizeLearningConversation', 'saveTeacherPromptPreset');

  // 两个条件缺一不可：is(finalized_at, null) 让并发提交只有一个能成，
  // select('id') 让「RLS 静默过滤 = 0 行」与「已更新」可区分。
  assert.match(body, /update\(\{ finalized_at: now \}\)[\s\S]*?\.is\('finalized_at', null\)/, '必须是条件更新，否则并发提交会互相覆盖');
  assert.match(body, /\.is\('deleted_at', null\)/, '学生已删除的会话不能被标记为已核实');
  assert.match(body, /update\(\{ finalized_at: now \}\)[\s\S]*?\.select\('id'\)/, '必须取回命中行，0 行要能看见');
  assert.match(body, /if \(!finalizedRows \|\| finalizedRows\.length === 0\)/, '0 行必须变成一条可展示的失败');
});

test('重置初始密码会作废旧会话，且应用层按本校过滤', () => {
  const sql = newestFunctionBody('set_initial_password_by_profile');
  // 会话 cookie 的签名材料含 session_version，不递增 = 旧会话在重置后依然有效。
  assert.match(sql, /session_version = p\.session_version \+ 1/, '重置密码必须递增 session_version');

  const body = functionBody(admin, 'resetInitialPasswords', 'createClass');
  assert.match(body, /role\.data\.school_id/, '必须按调用者的学校过滤，不许把边界全推给 RPC');
  assert.match(body, /crossTenant\.length > 0/, '越界账号必须被点名拒绝，而不是逐个静默失败');
});

test('can_admin_profile 不再兜底「未划归」档案', () => {
  const sql = newestFunctionBody('can_admin_profile');

  // me.school_id 为空时，`target.school_id is null or ...` 就是无边界全库兜底。
  assert.match(sql, /me\.school_id is not null/, '校 admin 必须自己已挂校');
  assert.match(sql, /target\.school_id = me\.school_id/, '校 admin 只能管本校成员');
  assert.doesNotMatch(sql, /target\.school_id is null or/, '未划归兜底已被删除，不能被加回来');
  assert.match(sql, /target\.role <> 'org_admin'/, '公司级账号对任何学校都不可见（20260915231533 的修复）');
});

test('重导入名册不得隐式改角色', () => {
  const sql = newestFunctionBody('provision_school_account');
  assert.match(sql, /a role change must be made explicitly/, '同校同号但角色不同时必须拒绝');
  assert.doesNotMatch(sql, /set display_name = p_display_name, role = p_role/, '不能把角色跟着姓名一起 set');

  // 应用层要在调 RPC 之前就把这件事说清楚，而不是等 DB 抛一句英文。
  const body = functionBody(org, 'createSchoolAdmin');
  assert.match(body, /\.eq\('school_id', schoolId\)[\s\S]*?\.eq\('login_id', loginId\)/, '必须先查同校同工号');
  assert.match(body, /if \(existing\) \{[\s\S]*?return \{ ok: false/, '命中已有账号必须拒绝创建');
});

test('学生迁班收在一个事务里，且是 invoker（RLS 仍是防线）', () => {
  const sql = newestFunctionBody('transfer_student_to_class');

  assert.match(sql, /security invoker/, '必须是 invoker：RPC 只收拢步骤，不绕过 RLS');
  assert.match(sql, /delete from public\.class_memberships/, '必须删旧关系');
  assert.match(sql, /insert into public\.class_memberships/, '必须插新关系');
  assert.match(sql, /update public\.projects set class_id/, '必须迁移 projects.class_id');
  assert.match(sql, /update public\.conversations[\s\S]*?set class_id/, '必须迁移 conversations.class_id');
  assert.match(sql, /role = 'student' and p\.status = 'active'/, '只允许把活跃学生迁班');

  // 应用层那四步一旦有一处还在，就是半迁移态的后门。
  const addMember = functionBody(admin, 'addClassMember', 'removeClassMember');
  assert.match(addMember, /rpc\('transfer_student_to_class'/, 'addClassMember 必须走 RPC');
  assert.doesNotMatch(addMember, /from\('class_memberships'\)\.delete/, '应用层不得再自己删旧关系');
  const csvImport = functionBody(admin, 'importUsersFromCsv', 'getAdminExports');
  assert.match(csvImport, /rpc\('transfer_student_to_class'/, 'CSV 导入的迁班也必须走同一个 RPC');
  assert.doesNotMatch(csvImport, /from\('conversations'\)\.update/, 'CSV 导入不得再自己改 conversations.class_id');
});

test('Provider 的写路径都要取回命中行数', () => {
  // 不加 select 时 PostgREST 恒返回空数组，被 RLS 过滤的写入既不报 error 也不返回行，
  // 于是「保存失败」在界面上长成「保存成功但列表里没有它」。
  for (const name of ['saveProviderConfigV2', 'updateProviderConfig', 'deleteProvider', 'saveProviderHealthCheck', 'saveProviderApiModels', 'updateProviderCapabilities']) {
    const body = functionBody(admin, name, 'createMcpServer');
    assert.match(body, /\.select\(/, `${name} 必须取回写入结果`);
  }
  // base_url 决定带密钥的出站请求发到哪里，与 MCP 远程地址同一道闸门。
  for (const name of ['saveProviderConfigV2', 'updateProviderConfig']) {
    assert.match(functionBody(admin, name, 'createMcpServer'), /assertAllowedProviderBaseUrl/, `${name} 必须校验 baseUrl`);
  }
});

test('空间成员操作的 intent 是白名单，保存/归档查命中行', () => {
  const addStudent = functionBody(spaces, 'setSpaceStudentAction', 'setSpaceClassAction');
  // 旧写法 `intent !== 'remove'` 会把拼错或被篡改的 intent 静默走成"加入"，
  // 于是"移出学生"这个删除动作变成了添加。
  assert.match(addStudent, /intent !== 'add' && intent !== 'remove'/, 'intent 必须走白名单');
  assert.doesNotMatch(addStudent, /\(\s*intent !== 'remove'\s*\)/, '不能再用「非 remove 即加入」的写法');
  assert.match(addStudent, /\.delete\(\)[\s\S]*?\.select\('id'\)/, '移出要能看见 0 行');
  assert.match(addStudent, /ignoreDuplicates: true[\s\S]*?\.select\('id'\)/, '加入要幂等且能区分「本来就在」');

  assert.match(functionBody(spaces, 'saveSpaceAction', 'setSpaceStudentAction'), /update\(\{[\s\S]*?\.select\('id'\)/, '保存空间要检查命中行');
  assert.match(functionBody(spaces, 'archiveSpaceAction'), /update\(\{ status: 'archived' \}\)[\s\S]*?\.select\('id'\)/, '归档要检查命中行');
});

test('数据层不再有裸 return;（静默失败必须变成可展示的错误）', () => {
  const offenders: string[] = [];
  for (const entry of readdirSync(dataDir)) {
    if (!entry.endsWith('.ts')) continue;
    const full = join(dataDir, entry);
    if (!statSync(full).isFile()) continue;
    const source = readFileSync(full, 'utf8');
    source.split('\n').forEach((line, index) => {
      // 匹配的是 `return;` 语句本身；`return undefined;` / `return x;` 都放行。
      if (/^\s*return\s*;\s*$/.test(line)) offenders.push(`${relative(dataDir, full)}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], '这些 return; 让 server action 在失败时什么都不告诉调用方；改成返回 { ok:false, message }');
});
