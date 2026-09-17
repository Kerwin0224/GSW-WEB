import { z } from 'zod';

/**
 * 路由请求体里反复出现的两个 uuid 校验，差别是真实存在的、不能合并：
 *
 * - postgresUuidSchema 只认格式。库里的 uuid 列不保证 RFC 版本位，
 *   z.string().uuid() 的严格校验会把既有 id 判成非法（同款教训见 account-settings.ts）。
 * - conversationIdSchema 校验的是应用自己生成的 v4 uuid，可以按版本位严格校验；
 *   会话删除/回滚此前就用这个口径，放宽等于让非法 id 多走一轮查询。
 */
export const postgresUuidSchema = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');

export const conversationIdSchema = z.string().trim().uuid();
