import type { AppRole } from './supabase/database.types.ts';

/**
 * 角色 → 落地首页：proxy、根页、登录页、登录 API 四处共用的唯一真源。
 *
 * Record<AppRole, string> 是刻意的穷尽约束。此前四个调用点各抄一份：proxy 那份还用
 * `type AppRole = keyof typeof roleHome` 把类型收窄回自己的表，根页那份是 `as const`
 * 再靠 cast 取索引，登录页那份宽成 Record<string, string> —— 这三份都不是
 * Record<AppRole, string>，往 APP_ROLES 加一个角色时报不了错，新角色静默落到「无首页」：
 * proxy 拿不到它的守卫（任何登录用户都能直达其路径）、根页把它重定向到 /login、登录页
 * 把它的登录响应判为无效。写成 Record<AppRole, string> 后，漏声明一个角色 tsc 立即报错
 * （登录 API 那份原本就是这个形状，是四处里唯一会报错的）。
 *
 * 声明顺序即 proxy 前缀匹配的优先级（Object.entries().find() 取首个命中），不要重排。
 */
export const ROLE_HOME: Record<AppRole, string> = {
  student: '/student',
  teacher: '/teacher',
  admin: '/admin',
  org_admin: '/org',
};
