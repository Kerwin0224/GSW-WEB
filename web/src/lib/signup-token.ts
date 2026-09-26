import 'server-only';

import { createDatabaseSessionSignature } from '@/lib/session';

/**
 * signup-token.ts —— 新客户自助开通的一次性凭证。
 *
 * 独立于 data/tenant-signup.ts，因为那个文件带 'use server'：
 * 里面每一个 async 导出都会变成一个公开的 HTTP 端点。凭证校验本身没有返回值
 * 可泄漏，但它没有任何理由对匿名请求开放——把未认证入口的面积收到最小。
 *
 * 用的是**现有**的 private.runtime_secrets 口径（同一把 CWB_AUTH_SECRET，
 * 同一个 createDatabaseSessionSignature），没有第二套密钥体系：
 * 多出来的那一套迟早忘了轮换，忘了轮换的等于没有。
 *
 * 运营侧发 token 不需要任何新工具：
 *   node -e "const c=require('crypto');console.log('<随机串>:'+c.createHmac('sha256',process.env.CWB_AUTH_SECRET).update('onboard:<随机串>').digest('hex'))"
 * 把结果整串交给客户。
 */

const TOKEN_PREFIX = 'onboard:';

/** 常量时间比较：泄露前缀长度就够攻击者收窄搜索空间了。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function verifySignupToken(token: string): boolean {
  const source = token.trim();
  const separator = source.indexOf(':');
  if (separator <= 0 || separator === source.length - 1) return false;
  const nonce = source.slice(0, separator);
  const presented = source.slice(separator + 1);
  if (!/^[0-9a-f]{64}$/.test(presented)) return false;
  return timingSafeEqual(presented, createDatabaseSessionSignature(`${TOKEN_PREFIX}${nonce}`));
}
