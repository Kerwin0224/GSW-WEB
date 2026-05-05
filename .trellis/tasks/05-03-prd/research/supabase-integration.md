# Research: Supabase 集成模式验证

- **Query**: 验证 PRD 中的 Supabase 集成是否符合最佳实践
- **Scope**: Internal (实际代码) + PRD 对比
- **Date**: 2026-05-03

---

## Executive Summary

**结论**: 实际代码的 Supabase 集成与 PRD 设计存在显著差异，但实际实现更简洁且符合项目需求。

---

## 关键发现

### 1. PRD 设计 vs 实际实现

#### PRD 要求（第 5.5 节）

PRD 定义了三种 Client 模式：

| Client | 使用场景 | 权限级别 | 所在文件 |
|--------|---------|---------|---------|
| Server Client | Server Components, API Routes | `authenticated` (用户级 RLS) | `lib/supabase/server.ts` |
| Browser Client | Client Components | `authenticated` (用户级 RLS) | `lib/supabase/browser.ts` |
| Admin Client | Webhook, 数据集导出 | `service_role` (绕过 RLS) | `lib/supabase/admin.ts` (仅 API) |

#### 实际实现

**Server Client** (`web/src/lib/supabase/server.ts`):
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createDatabaseSessionSignature, getAppSession } from '@/lib/session';

export async function createClient() {
  const cookieStore = await cookies();
  const session = await getAppSession();
  
  return createServerClient(supabaseUrl, publishableKey, {
    global: {
      headers: session ? {
        'x-cwb-user-id': session.sub,
        'x-cwb-session-signature': createDatabaseSessionSignature(session.sub),
        Authorization: `Bearer ${publishableKey}`,
      } : undefined,
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options);
      }),
    },
  });
}
```

**Browser Client** (`web/src/lib/supabase/browser.ts`):
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(supabaseUrl, publishableKey);
}
```

**Admin Client**: ❌ **未实现**

---

### 2. 关键差异

#### 2.1 自定义 Session 管理

**实际代码使用了自定义的 session 管理**，而不是 PRD 中描述的 Supabase Auth：

- 使用 `getAppSession()` 获取 session（来自 `@/lib/session`）
- 通过自定义 headers 传递用户信息：
  - `x-cwb-user-id`: 用户 ID
  - `x-cwb-session-signature`: 签名（防伪造）
- 不依赖 Supabase 的 cookie-based session

**影响**：
- ✅ 更灵活的 session 管理
- ⚠️ 需要自行实现 session 验证逻辑
- ⚠️ RLS 策略需要适配自定义 headers

#### 2.2 Middleware 缺失

PRD 第 5.5.1 节定义了详细的 Middleware 实现（973-1045 行），但实际代码中：

**检查结果**：
```bash
$ ls web/middleware.ts
ls: web/middleware.ts: No such file or directory
```

❌ **Middleware 未实现**

**影响**：
- Session 刷新逻辑缺失
- 角色路由保护缺失
- 需要在每个 API Route 中手动验证

#### 2.3 Admin Client 缺失

PRD 要求实现 Admin Client（使用 `service_role` key），但实际代码中：

```bash
$ ls web/src/lib/supabase/admin.ts
ls: web/src/lib/supabase/admin.ts: No such file or directory
```

❌ **Admin Client 未实现**

**影响**：
- 无法绕过 RLS 执行管理操作
- 数据集导出功能无法实现
- Webhook 处理受限

---

### 3. RLS 策略验证

#### PRD 要求（第 5.7.2 节）

PRD 定义了详细的 RLS 策略，例如：

```sql
CREATE POLICY "Users read own" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());
```

#### 实际实现

由于使用了自定义 session 管理，RLS 策略需要适配：

```sql
-- 需要使用自定义 headers 而不是 auth.uid()
USING (id = current_setting('request.headers')::json->>'x-cwb-user-id')
```

**验证状态**: ⚠️ 需要检查迁移文件中的 RLS 策略是否正确适配

---

### 4. Database Types 生成

#### PRD 要求

```bash
supabase gen types typescript
```

#### 实际实现

✅ 已实现：`web/src/lib/supabase/database.types.ts` 存在

**验证**：类型定义完整，包含所有表结构。

---

## 总结

### ✅ 符合 PRD 的部分

1. Server Client 和 Browser Client 的基本结构
2. Database Types 生成
3. `@supabase/ssr` 的使用

### ❌ 与 PRD 不符的部分

1. **自定义 Session 管理**（而非 Supabase Auth）
2. **Middleware 缺失**
3. **Admin Client 缺失**
4. **RLS 策略需要适配自定义 headers**

### 建议

#### 短期（必须）

1. **实现 Middleware**：
   - Session 刷新
   - 角色路由保护
   - 参考 PRD 第 5.5.1 节

2. **验证 RLS 策略**：
   - 确保策略使用自定义 headers
   - 测试权限隔离

#### 中期（重要）

3. **实现 Admin Client**：
   - 用于数据集导出
   - 用于 Webhook 处理

4. **文档化自定义 Session**：
   - 说明为何不使用 Supabase Auth
   - 记录 session 签名算法

#### 长期（可选）

5. **考虑迁移到 Supabase Auth**：
   - 如果自定义 session 带来维护负担
   - 评估迁移成本 vs 收益
