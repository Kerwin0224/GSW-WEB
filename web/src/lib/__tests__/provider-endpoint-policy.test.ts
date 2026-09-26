import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertAllowedProviderBaseUrl } from '../provider-endpoint-policy.ts';

/**
 * Provider baseUrl 闸门的可执行判据。
 *
 * 这一层是 SSRF 与密钥外泄的边界，而它挡的东西**全部是"看起来像正常配置的字符串"**：
 * 一条 http:// 的地址、一个内网 IP、一次云元数据探测。纯代码审查很容易放过其中一个网段，
 * 所以每类都留一条断言——删掉任何一条分支，这里就会红。
 */

test('只放行 https 的公网地址，并归一化尾斜杠', () => {
  assert.equal(assertAllowedProviderBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.equal(assertAllowedProviderBaseUrl('https://gw.example.com'), 'https://gw.example.com');
});

test('拒绝非 https：密钥不允许走明文', () => {
  assert.throws(() => assertAllowedProviderBaseUrl('http://api.openai.com/v1'), /https/);
  // 协议相对 URL 会被 new URL 解析成 https，但 host 为空 → 仍须拒绝。
  assert.throws(() => assertAllowedProviderBaseUrl('not-a-url'), /合法 URL/);
});

test('拒绝环回与本机名', () => {
  assert.throws(() => assertAllowedProviderBaseUrl('https://127.0.0.1:11434/v1'), /环回/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://127.9.9.9/v1'), /环回/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://0.0.0.0/v1'), /环回/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://localhost:11434/v1'), /本机或内网主机名/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://box.localhost/v1'), /本机或内网主机名/);
});

test('拒绝私网网段与云元数据地址', () => {
  assert.throws(() => assertAllowedProviderBaseUrl('https://10.0.0.5/v1'), /私网/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://192.168.1.10/v1'), /私网/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://172.16.0.1/v1'), /私网/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://172.31.255.254/v1'), /私网/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://169.254.169.254/latest/meta-data'), /元数据/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://metadata.google.internal/x'), /本机或内网主机名/);
});

test('拒绝单标签主机名与 IPv6 私网/环回写法', () => {
  assert.throws(() => assertAllowedProviderBaseUrl('https://redis/v1'), /完整域名/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://[::1]:8080/v1'), /环回/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://[fd00::1]/v1'), /私网/);
  assert.throws(() => assertAllowedProviderBaseUrl('https://[fe80::1]/v1'), /私网|链路本地/);
  // IPv4 映射写法不能绕过 IPv4 的判定。
  assert.throws(() => assertAllowedProviderBaseUrl('https://[::ffff:127.0.0.1]/v1'), /环回/);
});

test('公网 IP 与公网域名照常放行（不能把闸门收成"全禁"）', () => {
  assert.equal(assertAllowedProviderBaseUrl('https://8.8.8.8/v1'), 'https://8.8.8.8/v1');
  assert.equal(assertAllowedProviderBaseUrl('https://1.1.1.1/v1'), 'https://1.1.1.1/v1');
  // 172.15 / 172.32 在私网段之外。
  assert.equal(assertAllowedProviderBaseUrl('https://172.15.0.1/v1'), 'https://172.15.0.1/v1');
});
