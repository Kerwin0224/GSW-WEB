import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

/**
 * 平台配置的租户边界是**只写在 SQL 里**的，没有应用层兜底：
 * 三个解析 RPC 都是 security definer，RLS 对它们不生效（owner 是表 owner），
 * 所以租户谓词一旦被删，就是静默的跨校泄漏——没有类型错误、没有测试失败、界面上一切正常。
 *
 * 这个文件把「谓词必须在」变成可执行的断言。改动那些函数时它会拦住你。
 */

import { migrationFiles, newestFunctionBody, newestPolicy } from './migration-source.ts';

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
