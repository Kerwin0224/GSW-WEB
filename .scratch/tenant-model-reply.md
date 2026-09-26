迁移我来写，已经写好：`20260926171000_login_pattern_and_password_provisioning.sql`（连同 `20260926170000_configurable_tables_reachability.sql`）。你按下面的**实际签名**写代码，不要自己再写迁移。

## 你可以调用的四个函数（签名已定稿）

```
provision_school_account_v2(
  p_login_id text, p_display_name text, p_role app_role,
  p_school_id uuid, p_initial_password text, p_server_signature text
) returns uuid
```
- 账号格式按**目标学校**的 `schools.login_id_pattern` 校验，查不到回落 `^\d{8}$`
- `p_initial_password` 传 null 或长度 < 6 时，DB 自己生成 `<login_id>-<8位十六进制>`
- 重导入路径**不覆盖已有密码**——CSV 重跑不该把人踢下线
- server signature 沿用 `hmac('provision_school_account', secret)`

```
set_initial_password_by_profile_v2(
  p_profile_id uuid, p_password text, p_server_signature text
) returns void
```
- `p_password` 传空则同上自动生成
- **每次重置都会 `session_version + 1`**，改口令立刻让旧会话失效
- 范围仍由 `can_admin_profile` 判定

```
authenticate_school_account_v4(
  p_login_id text, p_password text, p_server_signature text, p_school_id uuid
) returns table (id, display_name, role, school_id, organization_id)
```
- 已去掉 8 位正则。保留：必须 active、必须有口令、口令匹配、可选校过滤
- signature 沿用 `hmac('login:' || p_login_id, secret)`

```
create_tenant_invite(
  p_school_name text, p_school_kind text, p_login_id_pattern text,
  p_expires_at timestamptz, p_server_signature text
) returns text          -- 明文令牌，只返回这一次
redeem_tenant_invite(
  p_token text, p_org_name text, p_login_id text,
  p_display_name text, p_initial_password text
) returns table (organization_id, school_id, profile_id, initial_password)
```
- `create_tenant_invite` 只授 `service_role`，**不授 anon**——它在服务端调用，不经浏览器
- `redeem_tenant_invite` 授 anon，是公开的自助注册入口。令牌一次性、过期失效
- `redeem_tenant_invite` 返回的 `initial_password` 是**明文**，只在这一次返回，之后库里无明文。UI 必须一次性展示并提示立即保存
- 令牌走 `sha256` 摘要存库

旧的 `provision_school_account` / `set_initial_password_by_profile` / `authenticate_school_account_v3` 的 EXECUTE 已从 anon/service_role 收回。**所有调用点必须迁到 v2/v4**，否则线上直接 42501。

## 你要做的

1. `src/lib/data/account-provisioning.ts` 保持为唯一建号出口，`org.ts` / `admin.ts` 的 CSV / 自助开通三处都走它。
2. 登录路径改调 `authenticate_school_account_v4`。
3. 登录页拿不到 pattern 时安全回落（默认 8 位数字），**别让登录页因为一次查询失败就全站不可登录**。
4. 建号成功后的文案：一次性口令要展示给管理员，并写明「首次登录会强制改密」。不要再说「初始密码为工号本身」。
5. `database.types.ts` 不要动——我会在集成时统一补这四个函数。
6. CSV 批量导入若走 v2，逐行失败要能报出「第 N 行 + 原因」。现有契约是 invalidCount > 0 整体中止，若你改了这个语义要在报告里写清。

另外两处策略洞我已经一并修了，你不用再管：`subjects_read` 放开给本校教师读、`space_collaborators` 给协作者本人读 + 空间所有者读写、`space_members` 给空间所有者读。

其余部分（空间协作、能力位、机构形态、CSV 扩展、科目词表）按你原计划做。