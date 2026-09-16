/**
 * 迁移源码的读取工具，供各 *-contract.test.ts 共用。
 *
 * 为什么这些断言长这样：租户边界与安全谓词**只写在 SQL 里**，没有应用层兜底。
 * 一条策略被删掉或漏了租户谓词，不会有类型错误、不会有别的测试失败、界面上一切正常。
 * 契约测试把「谓词必须在」变成可执行的断言，改迁移时它会拦住你。
 *
 * 不是 *.test.ts，所以不会被 `npm test` 当成用例收走。
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(new URL('.', import.meta.url).pathname, '../../../supabase/migrations');

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(resolve(migrationsDir, file), 'utf8'));
}

/** 全部迁移按文件名排序后拼成一份文本，用于断言「某个片段在任何迁移里都不存在」。 */
export function allMigrationsText(): string {
  return migrationFiles().join('\n');
}

/**
 * 取某个函数**最后一次**定义的函数体。
 * 必须切出函数体而不是返回整个迁移文件：一份迁移里有几十条语句，
 * 拿全文做断言会把别的函数的 current_school_id 也算进来，测试就失去意义。
 */
export function newestFunctionBody(name: string): string {
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

/**
 * 取某条策略**最后一次**定义（策略不是函数，用分号切）。
 *
 * 大小写不敏感：baseline 是 pg_dump 产物，写的是 `CREATE POLICY "x"`；
 * 手写迁移写的是 `create policy "x"`。按大小写敏感找，会看不见 baseline 里那些策略——
 * 恰恰是没被后续迁移重写、最容易漂移的那一批（跨租户读漏洞就藏在其中一条里）。
 */
export function newestPolicy(name: string): string {
  const marker = `policy "${name}"`.toLowerCase();
  let body = '';
  for (const sql of migrationFiles()) {
    const haystack = sql.toLowerCase();
    let cursor = 0;
    while (true) {
      const start = haystack.indexOf(marker, cursor);
      if (start < 0) break;
      const end = sql.indexOf(';', start);
      body = end < 0 ? sql.slice(start) : sql.slice(start, end);
      cursor = start + marker.length;
    }
  }
  assert.ok(body, `应能找到策略 ${name}`);
  return body;
}
