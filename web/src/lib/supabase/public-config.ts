/**
 * Supabase 公开配置读取。
 *
 * 单独成模块而不是塞进 server.ts：server.ts 依赖 next/headers 与 @/lib/session，
 * 客户端组件 import 它会直接炸。这里没有任何 server-only 依赖，浏览器侧可安全引用。
 */
export function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
