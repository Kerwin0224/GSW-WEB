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

const migrationsDir = resolve(new URL('.', import.meta.url).pathname, '../../../supabase/migrations');

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(resolve(migrationsDir, file), 'utf8'));
}

/**
 * 取某个函数**最后一次**定义的函数体。
 * 必须切出函数体而不是返回整个迁移文件：一份迁移里有几十条语句，
 * 拿全文做断言会把别的函数的 current_school_id 也算进来，测试就失去意义。
 */
function newestFunctionBody(name: string): string {
  // 只认定义语句。`revoke all on function public.X() ...` 含同样子串，
  // 按它切会把后面几十行别的语句当成「函数体」，断言随之失去意义。
  const marker = `create or replace function public.${name}(`;
  let body = '';
  for (const sql of migrationFiles()) {
    let cursor = 0;
    while (true) {
      const start = sql.indexOf(marker, cursor);
      if (start < 0) break;
      const end = sql.indexOf('$$;', start);
      body = end < 0 ? sql.slice(start) : sql.slice(start, end);
      cursor = start + marker.length;
    }
  }
  assert.ok(body, `应能找到 ${name} 的函数体`);
  return body;
}

/** 取某条策略**最后一次**定义（策略不是函数，用分号切）。 */
function newestPolicy(name: string): string {
  const marker = `policy "${name}"`;
  let body = '';
  for (const sql of migrationFiles()) {
    let cursor = 0;
    while (true) {
      const start = sql.indexOf(marker, cursor);
      if (start < 0) break;
      const end = sql.indexOf(';', start);
      body = end < 0 ? sql.slice(start) : sql.slice(start, end);
      cursor = start + marker.length;
    }
  }
  assert.ok(body, `应能找到策略 ${name}`);
  return body;
}

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
