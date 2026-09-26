import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * 平台配置的租户边界是**只写在 SQL 里**的，没有应用层兜底：
 * 三个解析 RPC 都是 security definer，RLS 对它们不生效（owner 是表 owner），
 * 所以租户谓词一旦被删，就是静默的跨校泄漏——没有类型错误、没有测试失败、界面上一切正常。
 *
 * 这个文件把「谓词必须在」变成可执行的断言。改动那些函数时它会拦住你。
 */

import { allMigrationsText, migrationFiles, newestFunctionBody, newestPolicy } from './migration-source.ts';

const teacherSource = readFileSync(resolve(new URL('.', import.meta.url).pathname, '..', 'data', 'teacher.ts'), 'utf8');

/** 切出 teacher.ts 里某个顶层函数的函数体。 */
function teacherFunction(name: string) {
  const start = teacherSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `应能找到 ${name}`);
  const end = teacherSource.indexOf('\n}\n', start);
  return teacherSource.slice(start, end < 0 ? teacherSource.length : end);
}

test('教师教学作用域是「任教班级 ∪ 自己拥有的空间」', () => {
  const scope = teacherFunction('getTeacherScope');
  assert.match(scope, /from\('class_memberships'\)[\s\S]*?eq\('role', 'teacher'\)/, '任教班级那一路必须还在');
  assert.match(scope, /from\('spaces'\)[\s\S]*?eq\('owner_id', teacherId\)/, '空间那一路按 owner_id 取');

  // 三处判定必须共用同一份并集语义，漏改一处就是「列表看得到、点进去打不开」或统计少算。
  for (const name of ['getTeacherAuditQueue', 'getTeacherAuditSession', 'getTeacherAnalytics']) {
    const body = teacherSource.slice(teacherSource.indexOf(`export async function ${name}(`));
    assert.match(body.slice(0, body.indexOf('\nexport ')), /getTeacherScope\(role\.data\.id\)/, `${name} 必须走同一个作用域 helper`);
  }
  const session = teacherSource.slice(teacherSource.indexOf('export async function getTeacherAuditSession('));
  assert.match(session, /inTeacherScope\(scope, row\.class_id, row\.space_id\)/, '详情页必须按班级或空间判定，不能只判 class_id');
  const analytics = teacherSource.slice(teacherSource.indexOf('export async function getTeacherAnalytics('));
  assert.match(analytics, /inTeacherScope\(scope, conversation\.class_id, conversation\.space_id\)/, '统计里的近 7 天与已/待核实必须同一并集判定');
});

test('教师作用域过滤器在两个集合都为空时不生成非法片段', () => {
  const filter = teacherFunction('buildScopeFilter');
  assert.match(filter, /class_id\.in\.\(/, '必须包含 class_id 一段');
  assert.match(filter, /space_id\.in\.\(/, '必须包含 space_id 一段');
  // `.in.()` 是 PostgREST 语法错误（400）：空集合绝不能进串里，两边都空要返回 null 让调用方短路。
  assert.match(filter, /classIds\.length > 0/, 'class_id 段必须先判非空');
  assert.match(filter, /spaceIds\.length > 0/, 'space_id 段必须先判非空');
  assert.match(filter, /: null;/, '两边都空时必须返回 null，而不是空串或 `in.()`');

  const queue = teacherSource.slice(teacherSource.indexOf('export async function getTeacherAuditQueue('));
  assert.match(queue, /if \(!scopeFilter\) return ok\(emptyPage\)/, '队列在空作用域时必须短路成空页，而不是发必然 400 的请求');
  // 两级 count 共用 countScoped 一个 builder，行查询是另一个：两处都要吃并集过滤器，
  // 漏一处就变成「列表有行、角标是 0」或反之。
  const countScoped = queue.slice(queue.indexOf('const countScoped ='), queue.indexOf('const scopedQuery ='));
  assert.match(countScoped, /\.or\(scopeFilter\)/, '两级 count 必须也按并集过滤');
  const scopedQuery = queue.slice(queue.indexOf('const scopedQuery ='), queue.indexOf('const range ='));
  assert.match(scopedQuery, /\.or\(scopeFilter\)/, '行查询必须按并集过滤');
  assert.doesNotMatch(queue.slice(0, queue.indexOf('const range =')), /\.in\('class_id'/, '不能再只按 class_id 过滤');
});

test('多重班级归属的两个 RPC 都存在且契约明确', () => {
  const add = newestFunctionBody('add_class_membership');
  assert.match(add, /security invoker/, 'invoker：RLS 仍是防线');
  assert.doesNotMatch(add, /delete from public\.class_memberships/, '增量加入不得删旧关系');
  assert.doesNotMatch(add, /update public\.conversations/, '增量加入不得改写历史归属');
  assert.match(add, /return 0;/, '已在此班且未提升主班必须返回 0 而不是抛错（幂等重放）');

  const remove = newestFunctionBody('remove_class_membership');
  assert.match(remove, /delete from public\.class_memberships\s+where profile_id = p_profile_id/, '只删这一个班的关系');
  assert.doesNotMatch(remove, /update public\.(conversations|projects)/, '移除单个班级关系不得改写历史归属');

  const admin = readFileSync(resolve(new URL('.', import.meta.url).pathname, '..', 'data', 'admin.ts'), 'utf8');
  assert.match(admin, /rpc\('add_class_membership'/, 'addClassMember 的「加入」分支必须走 RPC');
  assert.match(admin, /rpc\('transfer_student_to_class'/, '「迁班」分支仍走原有 RPC');
  // 0 行对「加入」是幂等成功，对「迁班」是没落库——两者都不能静默报成功。
  assert.match(admin, /if \(affected === 0\) return actionResult\(true/, '加入分支必须单独解释 0 行');
  assert.match(admin, /transferCount < 1\) return actionResult\(false/, '迁班分支必须检查命中行数');
});

test('`create or replace` 之外没有给返回整数的函数换签名', () => {
  const add = newestFunctionBody('add_class_membership');
  assert.match(add, /returns integer/, '返回行数而不是 void，调用方才判得出 0 行');
  assert.match(allMigrationsText(), /grant execute on function public\.add_class_membership\(uuid, uuid, boolean\) to anon/, 'app role 必须能调用');
  assert.match(allMigrationsText(), /grant execute on function public\.remove_class_membership\(uuid, uuid\) to anon/, 'app role 必须能调用');
});

test('能力解析 RPC 按校过滤，本校优先、回退公司级', () => {
  const sql = newestFunctionBody('get_provider_capability_provider');

  assert.match(sql, /v_school uuid := public\.current_school_id\(\)/, '应从调用者档案取学校');
  assert.match(sql, /pc\.school_id is null or pc\.school_id = v_school/, '应只返回本校行与公司级行');
  assert.match(sql, /order by \(pc\.school_id is null\)/, '本校行必须排在公司级之前（回退靠这个顺序）');
});

test('tier 解析 RPC 同样按校过滤', () => {
  const sql = newestFunctionBody('get_model_tier_provider');

  assert.match(sql, /mtb\.school_id is null or mtb\.school_id = v_school/);
  assert.match(sql, /order by \(mtb\.school_id is null\)/);
});

test('MCP 取值 RPC 本校优先且整体替换', () => {
  const sql = newestFunctionBody('get_role_mcp_servers');

  assert.match(sql, /v_school uuid := public\.current_school_id\(\)/);
  // 本校有可用 Server 时只用本校的；否则回退公司级。
  assert.match(sql, /s\.school_id = v_school/);
  assert.match(sql, /s\.school_id is null/);
});

test('已发布备课模板的读取带租户谓词', () => {
  const sql = newestPolicy('presets_published_school_read');

  // 这里曾经是 `purpose='chat' and status='published'` 的全局放行：
  // 任何已登录用户可读任何学校的备课模板。
  assert.match(sql, /school_id = public\.current_school_id\(\)/, '本校模板按本校可见');
  assert.match(sql, /organization_id = \(select me\.organization_id/, '公司级模板限本公司');
});

test('capability 的租户归属由 provider 继承，不取会话默认值', () => {
  const sql = newestFunctionBody('sync_provider_capability_school');

  // 若这里改用 current_school_id()，org_admin 给某校 provider 配能力时会写出
  // school_id=NULL 的行，所有学校都能回退拿到它 —— 跨校泄漏。
  assert.match(sql, /select p\.school_id from public\.provider_configs p where p\.id = new\.provider_id/);
  assert.doesNotMatch(sql, /current_school_id/);
});

test('预设归属由创建者继承，不靠各写入口自己填', () => {
  const sql = newestFunctionBody('sync_prompt_preset_scope');

  // 写入口有三处（教师建归类规则、教师存模板、管理员建模板）。漏掉任何一处，
  // 那条规则就会因为 school_id / organization_id 为空而谁都读不到：
  // 归类静默退回内置默认，等于教师配的口径没生效。
  assert.match(sql, /select p\.organization_id, p\.school_id into new\.organization_id, new\.school_id/);
  assert.match(sql, /from public\.profiles p where p\.id = new\.created_by/);
});

test('迁移带派生表非空自检（它空了就是所有模型调用 503）', () => {
  // 自检写在迁移的 do $$ 块里（迁移级门禁），不在函数体内——函数里 raise 只会在运行时炸。
  const sql = migrationFiles().join('\n');

  assert.match(sql, /raise exception 'rebuild produced zero derived capability rows/);
});

/**
 * `create or replace function` **不能改返回类型**（SQLSTATE 42P13），改了必须 drop 再建。
 * 这条线上炸过一次：132800 建了 6 列的 get_role_mcp_servers，132900 想加一列 school_id
 * 直接 replace，迁移 CI 失败、生产卡在「新代码 + 半迁移」。
 *
 * 这里按时间顺序重放所有迁移，找出「同名函数、returns table 列不同、却没用 drop function」的。
 */
test('没有靠 create or replace 改函数返回类型（那会直接炸迁移）', () => {
  const signatures = new Map<string, string>();
  const violations: string[] = [];

  for (const sql of migrationFiles()) {
    // 同一文件里 create 与 drop 的先后也重要，所以按出现位置排序后重放。
    const events: Array<{ at: number; kind: 'create' | 'drop'; name: string; columns?: string }> = [];
    for (const match of sql.matchAll(/create\s+(or\s+replace\s+)?function\s+public\.(\w+)\s*\([^)]*\)\s*returns\s+table\s*\(([^)]*)\)/gi)) {
      events.push({ at: match.index ?? 0, kind: 'create', name: match[2], columns: match[3].replace(/\s+/g, ' ').trim().toLowerCase() });
    }
    for (const match of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) {
      events.push({ at: match.index ?? 0, kind: 'drop', name: match[1] });
    }
    events.sort((left, right) => left.at - right.at);

    for (const event of events) {
      if (event.kind === 'drop') { signatures.delete(event.name); continue; }
      const previous = signatures.get(event.name);
      if (previous !== undefined && previous !== event.columns) {
        violations.push(`${event.name}: ${previous} → ${event.columns}`);
      }
      signatures.set(event.name, event.columns!);
    }
  }

  assert.deepEqual(violations, [], '改返回类型必须先 drop function');
});

/**
 * 不许 `revoke` / `grant` 一个自己早已 drop 或改名掉的函数。
 *
 * 这条线上炸过一次：160943 写死了
 *   revoke execute on function public.sync_text_project_contract() ...
 * 而它早在 132700 就被 `alter function ... rename to sync_project_contract` 改掉了，
 * 同组的 project_catalog_path 也在 132600 被 drop。`revoke` **没有** IF EXISTS 语法，
 * 于是整条迁移在 statement 5 上 42883 失败、整体回滚——`--dry-run` 不执行 SQL，
 * 看不出来；只有真推一次才知道。
 *
 * 判据只盯「已经被移走的那些名字」，不要求函数必须由迁移创建：
 * Supabase 自己的 rls_auto_enable 之类不在迁移里，不该被这条规则误伤。
 */
test('不 revoke/grant 一个更早的迁移已 drop 或改名的函数', () => {
  const removed = new Set<string>();
  const violations: string[] = [];

  // 注释要先剥掉：迁移文件里大量注释在**解释**某条 revoke 为什么危险，
  // 直接扫全文会把那些说明文字当成真的 revoke。剥注释不改同一文件内的相对顺序。
  const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

  for (const raw of migrationFiles()) {
    const sql = stripComments(raw);
    const events: Array<{ at: number; kind: 'remove' | 'restore' | 'use'; name: string }> = [];

    for (const match of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
      events.push({ at: match.index ?? 0, kind: 'remove', name: match[1].toLowerCase() });
    }
    for (const match of sql.matchAll(/alter\s+function\s+(?:public\.)?"?(\w+)"?\s*(?:\([^)]*\))?\s*rename\s+to\s+"?(\w+)"?/gi)) {
      // 改名 = 旧名移走 + 新名出现，两个位置相差 1 以保证旧名先于新名结算。
      events.push({ at: match.index ?? 0, kind: 'remove', name: match[1].toLowerCase() });
      events.push({ at: (match.index ?? 0) + 1, kind: 'restore', name: match[2].toLowerCase() });
    }
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?/gi)) {
      events.push({ at: match.index ?? 0, kind: 'restore', name: match[1].toLowerCase() });
    }
    for (const match of sql.matchAll(/(?:grant|revoke)[^;]*?\bon\s+function\s+(?:public\.)?"?(\w+)"?/gi)) {
      events.push({ at: match.index ?? 0, kind: 'use', name: match[1].toLowerCase() });
    }

    events.sort((left, right) => left.at - right.at);
    for (const event of events) {
      if (event.kind === 'remove') removed.add(event.name);
      else if (event.kind === 'restore') removed.delete(event.name);
      else if (removed.has(event.name)) violations.push(event.name);
    }
  }

  assert.deepEqual(
    [...new Set(violations)],
    [],
    '这些函数在本条迁移之前就被 drop/改名了，revoke/grant 会在生产上 42883；按名字查存在性再执行',
  );
});
