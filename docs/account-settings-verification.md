# 账号与校方运行记录验收

验收环境：Vercel 生产站点与已连接的 Supabase 生产项目。文档只记录脱敏结果，不保留账号标识、密码、Cookie 或完整请求 ID。

## 生产验收结果

- 管理员可从个人菜单进入账号设置；内置头像保存后刷新仍保留，导航头像同步更新。
- 错误当前密码返回 403；正确修改密码返回 200。
- 修改前建立的另一会话访问账号设置时被重定向到登录页，旧会话已失效。
- 修改后的旧密码登录返回 401，新密码登录返回 200。
- 错误登录、成功登录、错误改密和成功改密均生成同一请求内可配对的 started/completed 记录。
- 成功登录额外记录 `school_login_accepted`；成功改密在会话版本递增后仍记录 `account_password_change_completed`（HTTP 200）。
- 管理后台运行日志页面能按请求 ID 展示成功登录与成功改密记录。
- 验收结束后删除临时认证账号、关联 profile、密码尝试记录及精确匹配的 QA 日志；四类残留计数均为 0。

## 安全与发布检查

- Web 登录只调用 `authenticate_school_account_v2`，签名主题绑定规范化后的学校登录号。
- `write_app_log_event` 使用服务端 HMAC 和一次性事件 UUID；日志表主键阻止同一签名重放。
- 日志写入 RPC 仅允许 `anon` 与 `service_role` 执行，`authenticated` 无执行权。
- 旧 `authenticate_user` 与 `authenticate_school_account` RPC 已从 `public`、`anon`、`authenticated` 收回，只保留 `service_role` 执行权。
- Supabase 迁移 CI 与 Vercel 生产部署均通过后才执行生产回归。

## 自动化验证

- 全套 116 项测试通过。
- TypeScript 类型检查通过。
- ESLint 无错误；保留 17 条既有未使用符号警告。
- `supabase db reset` 与 `supabase db lint --local --level error` 通过。
- 无效日志签名被拒绝；有效签名首次写入成功，同一 UUID 与签名重放被主键拒绝。
