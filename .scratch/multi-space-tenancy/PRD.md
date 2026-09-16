# 多空间 SaaS：模块抽象与平台化设计

Status: ready-for-agent
日期：2026-09-16

目标：把「老师建空间、学生切空间、空间带主题」做成平台能力，同时收掉一路上暴露的耦合、
重复与跨租户越权。产品背景：卖给多所学校，老师可用来自建答疑空间并定制主题
（古诗文只是其中一个主题），老师提供语义规则，平台负责结构化返回。

---

## 一、领域裁定（本 PRD 的前提）

**空间**：**属于老师**（`owner_id` → teacher profile）的学习容器。老师可以管理多个班级，
可以**通过班快速拉学生**——选一个班，一次性把该班学生拉进空间。
空间必属一所学校（`school_id` NOT NULL），但**不隶属于某一个班**。

与 `classes` 解耦：`classes` 是学校的行政编班（`grade`、管理员迁班、学校行政语义），
空间是老师的学习容器。班在这里是**批量拉人的入口**，不是空间的归属。

**空间主题**：老师为空间写下的归类口径，是提示词不是配置。
与 CONTEXT.md 的**归类规则**是同一件事，粒度从「每师每班一条」演进为「每空间一条」。

**成员关系是显式的**：因为「拉学生」是一个有结果的动作（老师可能只拉一个班的部分学生），
不能用「空间 → 班 → 学生」的派生链替代。这意味着需要一张学生↔空间成员表，
也意味着**迁班不再等于退出空间**——成员关系是直接的，不随行政编班漂移。
这一点比「空间挂在班上」的模型干净：学生的空间归属不会因为管理员调整编班而静默改变。

具体的成员模型（表形状、接缝位置、RLS 谓词）由 Design-It-Twice 四路设计比较后确定，
见本文档末尾「设计评审结论」。

---

## 二、现状证据

### 2.1 租户边界实际锚在哪

关键前提：`src/lib/supabase/server.ts:24-47` 只用 publishable key + `x-cwb-session-signature` 头，
**全仓零 `service_role` 路径**（多租户审计已确认，`.env.local.example:12` 仅有声明）。
因此 **RLS 是唯一防线**，任一策略缺租户谓词都是实打实的跨租户洞。

| 层 | 载体 | 隔离谓词 | 证据 |
|---|---|---|---|
| 公司 | `organizations` | — | `20260912130000:12-31` |
| 学校=租户 | `schools` | — | 同上 |
| 编班 | `classes.school_id` | `can_admin_class` / `teacher_can_access_class`（含校界） | `20260912130000:87,127` |
| 成员 | `profiles.school_id` | `can_admin_profile` | `20260915231533:18` |
| 平台配置 | 5 表 `school_id` | `can_admin_school_scope` / `can_read_school_scope` | `20260916132900:335,353` |
| 学习数据 | `projects`/`conversations`/`documents`/`practice_records` | **无 `school_id`**，锚在 `class_id` | `20260912130000:194-224` |

### 2.2 挡住多空间的既有假设

**成员关系显式化后，「学生只属于一个班」不再是障碍**——
`baseline:1355` 的 `class_memberships_one_student_class_idx`
（`UNIQUE(profile_id) WHERE role='student'`）**不需要 drop**。
学生仍然只在一个行政班（`CONTEXT.md:190` 的既有裁定不变），
多出来的是他可以被拉进多个空间。这是两个正交的维度。

真正的障碍是这三条，它们都建立在「学生的空间归属 = 他的班」这个旧假设上：

| 层 | 位置 | 现在的行为 | 多空间下的后果 |
|---|---|---|---|
| DB 触发器 | `20260916132700:98-115` `sync_project_contract` | `select cm.class_id … limit 1` 推 `projects.class_id`，不匹配则 `raise exception` | **建项目直接失败** |
| 取数层 | `src/lib/data/classification-rule.ts:39-45` | `.limit(1).maybeSingle()` 只取唯一班级，只用那班规则 | 切空间后**静默用错主题** |
| 应用层迁班 | `admin.ts:438-442`、`admin.ts:913-915` | 先 `delete` 全部 student membership，再 upsert 一条 | 旧模型下迁班 = 退出所有空间；**显式成员表下这条自然消失**，但要确认迁班后学生留在原空间是否符合产品预期 |

UI 也按单班写：`src/app/admin/classes/page.tsx:94`「单班级归属」、
`src/app/admin/users/page.tsx:140`「学生只允许属于一个班级」——
这两处说的是**学生的行政班**，在新模型下仍然成立，属于正确表述，不要改。

第 2 条最隐蔽：它不报错，只会用错主题。第 1 条会硬报错，反而是好事。

### 2.3 学科假设的实现漂移

`bloom-levels.ts` 已收口（层级只描述认知操作），但平台层仍有硬编码：

| 位置 | 内容 |
|---|---|
| `src/components/workbench/student-chat-client.tsx:42` | `globalPromptChips = ['《静夜思》的“疑”是什么意思？', '这句怎么翻译？', '诗人为什么这样写？', ...]` — 写死诗名 +「诗人」+「翻译」 |
| `student-chat-client.tsx:195-196` | 项目上下文引导词写死「翻译／字词／作者」 |
| `src/app/student/challenge/page.tsx:186` | `{project.subtitle ?? '作者未标注'}` — `subtitle` 是通用字段，兜底文案假定「作者」 |
| `src/app/student/challenge/page.tsx:109`、`src/app/login/page.tsx:204` | 「选一篇学过的文章」「问字词、读篇章」 |
| `src/lib/project-title.ts:22-41` | 占位名名单含「篇目」系列；拒绝语正则含 `不(?:属于\|是\|在).{0,12}篇目` |
| 6 处组件 | 对通用 `project.name` 套书名号 `《》`（`project-card.tsx:49`、`audit-queue-nav.tsx:69`、`challenge-client.tsx:199` 等） |

`CONTEXT.md:223-224` 已裁定：「界面与提示词的通用位置用**项目**/学习主题；
只有教师自己写的归类口径里才该出现具体学科词」。上表全部是漂移。

---

## 三、模块抽象诊断

拿 `bloom-levels.ts` 当尺子——全仓最好的模块：接口只有 `BLOOM_LEVEL_INFO` + 两个 formatter，
实现藏着「层级只描述认知操作，不描述操作对象」这条口径，把原先散在 4 处且各自夹带古诗文
内容的定义收敛成一份。

| 模块 | 接口 | 实现 | 深度 |
|---|---|---|---|
| `bloom-levels.ts` | 2 formatter + 1 张表 | 四处漂移收敛为唯一真源 | **深**，可当模板 |
| `data/common.ts` | `requireRole`/`getCapability`/`resolveReadyModel` | 收口 55 处鉴权样板 + 4 处重复 503 守卫 | **深**，注释自陈了这段历史 |
| `classification-prompts.ts` | `(teacherRules) → string`、`(text) → {name,subtitle}` | 拼字符串 + 正则打捞 | **浅**：接口复杂度与实现复杂度持平，零杠杆 |
| `project-title.ts` | 3 个纯函数 | 字数不多，但它是**下游补偿** | 深度够，存在的理由可议 |
| `prompt_presets`（跨 DB + 3 文件） | 13 列 ×(`purpose`,`class_id`,`school_id`,`target_role`) 四轴交叉 | 3 种用途挤一张表 | **最浅** |

### 3.1 高耦合低内聚

| 文件 | 行数 | 混装了什么 | 切法 |
|---|---|---|---|
| `data/admin.ts` | 976 | 用户／班级／Provider／MCP／预设／CSV 导入／导出队列 **7 组** | Provider+MCP 组（约 312 行）与用户班级组零关系，先切这一刀 |
| `data/teacher-actions.ts` | 867 | 核实写 + AI 预审 + SFT/DPO 物化 + **预设 CRUD** + **归类规则 CRUD** | `saveTeacherPromptPreset`(:770)、`saveClassClassificationRule`(:810) 共约 97 行与核实域无关 |
| `data/teacher.ts` | 713 | 取数 + 85 行纯 metadata 解析（`parsePreReview` :83-166）+ 覆盖度状态机 | 纯逻辑该走 `audit-record.ts` 那条路 |
| `data/student.ts` | 473 | 取数 + 54 行业务状态机（`buildChallengeProgress` :108-161） | 同上 |

### 3.2 重复（量化）

| 重复项 | 次数 | 根因 |
|---|---|---|
| `const role = await requireRole(...); if (!role.ok) return role;` | **55 处手写** | `common.ts` 只提供了 `requireRole`，没提供包装器 |
| 返回形状 | **7 种并存** | `AuditSubmissionState` 与 `AdminActionState` 逐字段相同；`AdminActionLike` 注释自称「与 admin.ts 形状一致」 |
| 手写 `{ok:true}` 不走 `ok()` | teacher-actions 61 / org 20 / admin 16 | 与上一条同源 |
| 同表同条件查班级成员 | **6 份** | `teacher.ts:168` 的 `getTeacherClassIds` **没导出**，逼得 `teacher-actions.ts` 内联重抄 3 次 |
| 聊天两端重复 | 附件上传全流程（`student-chat-client.tsx:319-358` vs `teacher-chat-client.tsx:194-227`，payload 类型注解**逐字相同**）、删除会话、**会话列表行 JSX 三份近乎逐字相同** | `ChatWorkspace` 只抽了版式 4 slot，业务零复用（`chat-workspace.tsx:16-17` 自陈） |
| 软删除 / finalized 过滤 | 6 文件 23 处 | `finalized` **三套判定不同源**：列 `finalized_at` ／扫 metadata JSON ／RPC `is_student_conversation_finalized` |
| `DataResult` 失败文案手拼 | 300+ 处 `.message` 拼接 | `fail(reason, message)` 只有一个 message 槽，逼出 `message: \`X失败：${error.message}\`` |

### 3.3 类型真源漂移（独立缺陷）

`src/lib/supabase/database.types.ts` 是**手写**的，不是 `gen types` 产物：无 `Relationships` 键、
`Views: Record<string, never>` 占位、含中文业务注释与自定义别名（`AppRole`/`Vector`/`AvatarKey`）。
但 `docs/agents/deployment.md` 标准流程第 3 步写的正是
`supabase gen types typescript --local > src/lib/supabase/database.types.ts`，
`package.json` 无对应脚本。任何一次按文档执行都会冲掉手写类型。

---

## 四、目标形状

### 4.1 第一步 · 解锁多空间

> 已由 Design-It-Twice 四路设计 + 三视角对抗验证确定，见文末「设计评审结论」。
> 结论：不在 `class_memberships` 上做成员关系，改用 `spaces` + `space_classes` 两张新表，
> 学生由「班」派生。**学习数据四张表一列不加。**

1. 新建 `spaces` + `space_classes`，`profiles` 加 `active_space_id`
2. `classification-rule.ts` 从「多班并列 + 模型自选」收敛为**取一个主题**
   （`classification-prompts.ts:113-125` 那段「【教师A】/【教师B】请选用最贴合的那条」**净减代码**）
3. 学生端加空间切换，复用 `class-rule-panel.tsx:50-63` 的 pill 交互，不新造
4. `class_memberships_one_student_class_idx` 与 `sync_project_contract` **都不动**——
   学生仍只属一个行政班（`CONTEXT.md:190`），两条正交

### 4.2 第二步 · 把主题从预设表里拿出来

新建 `spaces` + `space_themes`（空间必属学校，`school_id` 兜底非空）：
- `spaces(id, school_id NOT NULL, class_id, name, created_by, …)`
- `space_themes(id, space_id, semantics text, status, created_by)` —— 接口只暴露三件事：
  `theme_of(spaceId)` / `publish(spaceId, semantics, authorId)` / `resolve_for(studentId)`

`prompt_presets` 回归「备课问答模板」单一职责，同时删掉基线化石列
`variables`/`version`/`user_template`/`scenario`（`teacher-actions.ts:849` 仍在写
`scenario: '项目归类'`）。

### 4.3 第三步 · 协议 schema 化（解耦结构化返回与教师语义）

**现状**：两个通道塞进同一段字符串（`classification-prompts.ts:109-126`）：

```
buildProjectClassificationInstruction({ teacherRules })
  = [ 默认口径 | "选用最贴合的那条" + 【教师A】规则 + 【教师B】规则 ]   ← 教师语义
  + [ projectClassificationProtocol ]                                 ← 平台协议（:73，硬编码散文）
```

代价在解析端全额偿还：`project-title.ts:33` 拒绝语正则（模型不守协议改说人话）、
`:40` 去书名号、`:57` `looksLikeTitleLine`、`parseClassificationAnswer` 的 `《》` 打捞分支。

**同一仓里已有第二套机制在跑**：`api/challenge/generate`、`api/challenge/evaluate`、
`teacher-pre-review` 全用 `generateObject` + zod。所以「从模型拿结构」有两套实现，无共同接缝。

**目标**：协议从散文变 schema，教师语义只进 content 通道：

```ts
// 语义永远拿不到格式槽位
buildClassificationRequest({ schema, semantics, content }) → { system, prompt }
```

> **反建议**：先别建通用 `extract<T>()` 框架。真正赚钱的是第一步「协议 schema 化」——
> 它删掉的是 `project-title.ts` 的打捞代码与 `parseClassificationAnswer` 的容错分支，是净减代码。
> 通用接缝等第三个调用点出现再做。

### 4.4 第四步 · 收掉安全缺陷（独立可先做）

以下均为**已核实**（本轮读了原文的策略/函数体）：

| # | 缺陷 | 证据 | 影响 |
|---|---|---|---|
| S1 | `messages_conversation_scope` 用 `is_admin()`，**未随租户重写** | `baseline:1825-1827`，多租户审计确认无后续迁移覆盖 | org_admin 可读**任意公司**全部会话消息 |
| S2 | `get_profile(p_user_id)` 用 `is_admin()`，未收敛 | `baseline:231-236` | org_admin 可读跨公司任意 profile |
| S3 | `presets_admin_scope_all` 的 `school_id is null or …` 短路 | `20260916132900:439-452`（已读原文核实） | 校 admin 可读写**公司级模板**，与 ADR-0003 注释「校 admin 写不了任何东西」矛盾；WITH CHECK 允许把本校 preset 的 `school_id` 清成 NULL。**注意**：同一条策略的 `organization_id is null or …` 子句**同时收窄了 org_admin**——org_admin 只能写本公司模板，不像 ADR-0003 声称的那样能改所有公司级行 |
| S6 | **`createClass` 不写 `school_id`** | 已核实 `admin.ts:517` | 见 7.2 的 P1：`school_id is null` 被全域放行，跨校可见性兜底 |
| S4 | CSV 导入 `classes.upsert(..., { onConflict: 'name' })` | `admin.ts:911`；`classes.name` **无唯一约束**（已核实全仓无 `classes_name_key`） | 该分支报错；即便有约束也会**跨校命中同名班** |
| S5 | `match_document_chunks` 同 S1 | `baseline:356-369` | org_admin 可跨公司取 chunk |

S1／S2／S5 同根因：**`is_admin()` 在 `20260912130000:73` 从「校内 admin」扩成
「admin + org_admin」，凡是未被后续重写的 baseline 策略都静默纳入了 org_admin**。

---

## 五、开放问题

~~**Q1（阻塞第一步）**：空间是否必须支持「一个空间服务多个班」？~~
**已裁决（2026-09-16）**：空间属于老师，老师管多个班，通过班批量拉学生。
成员关系显式化，见第一节。

### Q1'（新的阻塞问题）：教师可见性的轴是**班**还是**空间**？

这是本次设计最关键的冲突，不是工程细节，是产品决策。

**现状**：`teacher_can_access_class` 是教师看学生记录的**唯一通路**，认的是 `class_id`。
被 9 条策略 + 1 个触发器使用：

| 用途 | 位置 |
|---|---|
| 会话读取 | `baseline:1778` `conversations_teacher_read` |
| 消息读取 | `baseline:1827` `messages_conversation_scope` |
| 消息更新（修订回答） | `baseline:1839-1841` `messages_teacher_update` |
| 项目读取 | `baseline:1892` `projects_teacher_read` |
| 挑战记录读取 | `baseline:1862` `practice_app_teacher_read` |
| 附件读取 | `baseline:1799` `documents_app_teacher_read`、`baseline:1748` `chunks_app_teacher_read` |
| 检索 RPC | `baseline:365` `match_document_chunks` |
| 核实记录读取/写入 | `baseline:1729` `audit_app_teacher_admin_read`；插入校验 `baseline:680` |

**冲突**：语文老师在空间 A、数学老师在空间 B，两空间服务同一个班 →
今天两位老师都能看到该学生在**对方空间**的全部会话（因为都认那个班）。
「空间属于老师」在隔离上就只是一句 UI 口号。

**两个方向**：

| | (a) 保持 class 轴 | (b) 改为 space 轴（或 class ∪ space） |
|---|---|---|
| 改动 | 9 条策略 + 触发器全部不动 | 9 条策略 + 触发器全改，`audit_records.class_id` 的 NOT NULL 语义要重议 |
| 代价 | 老师对**自己空间**里的学生没有独立权限；同班老师互相可见全部空间 | 与 `CONTEXT.md:191` 直接冲突（见下） |
| 换来 | 零风险 | 空间成为真正的隔离单元 |

**与 `CONTEXT.md:191` 的硬冲突**（改 space 轴必须先裁决这条）：

> 管理员将学生加入新班级时是自动迁班……迁班时同步更新该学生所有未删除 **项目** 和 **会话**
> 的班级归属到新班，**使新班教师可见完整学习记录核实历史**。

显式空间成员关系**不随迁班移动**。所以改 space 轴之后：
- 旧班老师仍持有空间成员关系 → 能看到空间，但看不到空间里的会话（class 轴丢了）
- 新班老师拿到会话可见性 → 但不在空间里

两边都拿不全。要么让迁班同步搬空间成员关系（那空间就又变回班的影子），
要么重新裁定「迁班后谁来继承学习记录」。

**Q2**：空间切换是否需要出现在教师侧（教师跨空间看自己拉的多个空间）？

**Q3**：`CONTEXT.md` 需要补「空间」「空间主题」两条领域语言——
`CONTEXT.md:34-36` 目前把「学生提问空间」定义为 UI 工作区，与「老师建的空间」是
**同词不同义**，必须区分（改哪个词、还是保留一词两义，请定）。

**Q4**：第三步 schema 化后，`project-title.ts` 的 `nonConcreteProjectTitles` 与
DB 触发器 `sync_project_contract()` 里那份名单是否保留双份？
（现有 `project-title.test.ts` 有源码契约断言守住两份一致。）

---

## 六、验收标准

- 一条迁移能让同一学生同时属于 2 个空间；`db reset` 零报错跑完
- 学生能切换空间，切换后归类口径用对应空间的主题（可观测：日志 `project_classification` 记录生效主题）
- 教师建空间、写主题、拉学生的完整闭环可用
- S1–S5 各有回归断言（迁移内自检或 `src/lib/__tests__/`）
- 新增的 `spaces`/`space_themes` 策略带 `school_id` 谓词，并有租户隔离测试
- 第一步完成后 `classification-rule.ts` 不再有 `.limit(1)`

---

## 七、设计评审结论（Design-It-Twice）

四路独立设计（最小接口 / 最大灵活 / 常见路径优先 / 零同步）× 三视角对抗验证
（RLS 泄漏 / 破坏路径 / 生命周期），17 个 agent 零错误。

### 7.1 推荐形状

**主体取「零同步」的接缝，配「常见路径优先」的单入口 RPC 与 `active_space_id`。**

```
spaces(id, school_id NOT NULL, owner_id → teacher, name, theme, status)
space_classes(space_id, class_id)          ← 成员关系就是这条边
profiles.active_space_id                   ← 学生「我此刻在哪个空间」
```

**学习数据四张表（projects / conversations / documents / practice_records）一列不加。**

决定性理由是 deletion test：`spaces` + `space_classes` 是四个设计里唯一能被**整体删除
而不牵动学习数据**的形状——模块只引用别人，从不被别人引用。全仓零 `service_role`、
RLS 是唯一防线时，**爆炸半径就是风险本身**。

三个候选目标形状对比：

| | 空间落点 | 学生成员 | 学习数据改动 | 教师核实链 |
|---|---|---|---|---|
| A `classes.kind='space'` | 复用 `classes` 多态 | 复用 `class_memberships` | 0 | 天然命中**但需 drop 唯一索引** |
| B 学习数据加 `space_id` | 新表 | 新表 | 3 张表 + 读策略 + 触发器 | 需改写 |
| **C 班派生（推荐）** | **新表** | **`space_classes` 边** | **0** | **天然命中** |

C 拿到 A 的「核实链不用动」，却没有 A 的代价：`class_memberships_one_student_class_idx`
**保持不动**，「一个学生一个行政班」这条学校侧真理不被破坏。关键性质是
**空间所有者必然是该班任课教师** ⇒ `teacher_can_access_class` 天然成立 ⇒
9 条教师读策略 + `audit_records.class_id NOT NULL` 一个字节不改。

### 7.2 已有前置缺陷（必须在第零段修）

| # | 缺陷 | 证据 | 为什么阻塞 |
|---|---|---|---|
| P1 | **`createClass` 不写 `school_id`** | 已核实 `admin.ts:517` `.insert({ name, grade, created_by })`；对比 CSV 导入 `admin.ts:911` 是写了 `caller.school_id` 的 | `can_admin_class` / `teacher_can_access_class` 对 `school_id is null` **全域放行**（`20260912130000:97/99/138`）⇒「本校老师只能管本校班」今天是个空承诺；且任何「空间的班必须与空间同校」的等值检查对自家 UI 建的班**永远不成立** |
| P2 | 归类 insert 失败被 catch 吞成 archive | `api/student/chat/route.ts:288-298` 把归类失败与插入被拒当同一件事 | 产出 `class_id IS NULL` 的孤儿会话：教师读不到、核实链进不去，学生端零报错 |
| P3 | 学习数据策略无租户重写，学生但**无 profiles 自更新策略** | 已核实：全仓迁移**无** `profiles for update` 策略（`memberships_member_select` 那 18 行是 `class_memberships`/`classes` 跨表引用，非本表策略） | 学生切换当前空间需要新的写路径（RPC 或新策略） |

> **P3 存疑，需以生产库实际状态确认**：迁移历史里不存在 `profiles_app_self_update`，
> 但生产库里可能有一条从未回流到迁移的策略。**CONTEXT.md 已裁定云端是业务数据真源、
> 迁移只是 schema-as-code 记录**——迁移缺席不等于库里没有。查证命令（需只读凭据）：
>
> ```sql
> select policyname, cmd, qual::text, with_check::text
>   from pg_policies where schemaname='public' and tablename='profiles';
> ```
>
> 若生产确无自更新策略，则 `active_space_id` 只能走 `switch_space` 这种 `security definer` RPC
> （学生改自己的行，函数内部限定 `id = current_app_user_id()`）。

### 7.3 对抗验证抓到的高价值反例

| 反例 | 设计 | 处置 |
|---|---|---|
| 策略互引导致 `infinite recursion detected in policy` | min-interface | **必修**。改名策略内联 `exists(select 1 from classes…)`，与 `classes_app_member_select`（内联 `select 1 from class_memberships`）闭合成环，两个方向都直接报错。**纯 DDL 自检与 `db reset` 都发现不了**。本仓 `can_admin_class`/`teacher_can_access_class` 全是 definer helper，正是既有代码躲开这个环的原因 |
| `conversations.space_id` 在任意 UPDATE 上被重算 | default-path | **必修**。触发器是 `BEFORE INSERT OR UPDATE`，迁班批量更新会重算全部历史会话的空间归属 → 别的老师凭空多出从未发生过的会话 |
| `is_space_member` 无租户谓词，只写在 `WITH CHECK` | zero-sync | **必修**。`classes.school_id` 可变；`join classes c on c.id = sc.class_id and c.school_id = s.school_id` 必须进**定义式**，不是写时断言 |
| `is_space_member` 缺「所有者仍任教该班」 | zero-sync | **必修**，且必须相对 `s.owner_id` 而非 `current_app_user_id()`——照抄 `teacher_can_access_class` 会在调用者是学生时求值为 false，把全体学生赶出空间 |
| `revoke … from anon` | zero-sync | **一行的自伤**。运行角色就是 `anon`（`server.ts:24-47` publishable key + 基线 `GRANT ALL ON TABLE … TO anon`），写 revoke 会让两张新表整表 42501。正确写法见 `20260912130000:448-449`：`grant execute … to anon` |
| 「移出的学生被下次拉班静默加回来」 | min-interface | 推荐方案不做逐个移出，此反例自然消失 |

### 7.4 推荐方案放弃了什么

1. **放弃显式成员表** ⇒ 放弃「逐个拉入/移出学生」与「只拉班里的部分学生」。
   这是与其它设计的分水岭：要支持就得引入第二份名册真源，而那份真源不响应班册变化、
   学生转学后留孤儿行。
2. **放弃「空间归属不随行政编班漂移」**：学生转班即离开旧空间。换来与 `CONTEXT.md:191`
   既有迁班不变量一致，且不多造一条比班关系活得更久的教师→学生读授权路径。
3. **放弃空间内的数据分区**：切空间只改新问题的归类口径，不改项目墙
   （与 `CONTEXT.md:146`「同一个学生对同一个篇目始终只有一个项目」一致）。
4. **放弃主题的草稿态**（`ClassRulePanel` 今天有）——待拍板，见 7.5。
5. **放弃空间硬删除**，只有归档。

### 7.5 待你拍板的产品问题

| # | 问题 | 影响 |
|---|---|---|
| R1 | **「把一个学生单独移出空间」要不要存在？** | 唯一会改表结构的决定。要 → 加排除表/墓碑，且必须回答「下次拉班能否加回来」（否则就是静默复活） |
| R2 | **空间是学校资产还是老师个人资产？** 老师调离时留校转交 vs 跟人走 | 跟人走要求 `spaces.school_id` 可改 + 放宽成员边同校约束，会开一个跨校口子 |
| R3 | **主题要不要草稿态与版本？** | 保留 → 草稿必须放**单独的表**（与生效值同行会被学生读到，已踩过） |
| R4 | **空间里的数据要不要分区？** | 要分区 → 必须给 projects/conversations 加 `space_id`（即方案 B 的代价） |
| R5 | **一个空间能否有多位老师（助教/协作）？** | 要 → `spaces` 需要教师成员表，`can_manage_space` 多一路分支 |

### 7.6 迁移顺序（三段，前两段零中断）

| 段 | 内容 | 硬指标 |
|---|---|---|
| **第零段（前置，独立）** | 修 P1 / P2 / P3 | 不修 P1，「空间与班同校」的等值检查对自家 UI 建的班永远不成立 |
| **第一段（随新代码同批）** | 2 张表 + `active_space_id` + 2 个 helper + 5 条策略 + 3 个 RPC | `db reset` 零报错；**自检必须含一条 anon 会话真读三张表的断言** |
| **第二段（同一次发布）** | `spaces.ts`；`classification-rule.ts` 换实现；`ClassRulePanel` 改指向 `spaces`；从既有条 published 规则回填 | **写入口与读入口同批换**，不留「旧写者还能写、新读者已不读」的窗口；旧行不删，作回滚面包屑 |
| **第三段（独立一次）** | 先 `drop policy` 三条预设策略，再删 `prompt_presets` 的 `project_classification` 行 | **绝不能与第一/二段同批**——迁移先于新代码生效，同批推送会让运行中的旧代码读到空规则表。与 `20260916132700` 的 `text_projects` 过渡视图是同一个坑 |

## 八、方法论说明

本 PRD 按 `codebase-design` 的词汇组织（**module**／**interface**／**seam**／**adapter**／**depth**／
**leverage**／**locality**）。判据用「deletion test」：删掉
`classification-prompts.ts` 这个模块，复杂度就变成每套学科一套分类器——
说明它**正在**赚它的位置；问题是它的接口（复杂散文拼接）比实现还费解，
所以该加深的是接口，不是删掉它。
