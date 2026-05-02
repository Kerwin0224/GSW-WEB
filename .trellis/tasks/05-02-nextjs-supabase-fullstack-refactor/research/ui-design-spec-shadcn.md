# 文韵智途 — UI/UX 设计规范 (基于 shadcn/ui)

> 来源: 用户 PRD §6 墨韵学堂设计系统 + Context7 shadcn/ui theming/组件验证 (2026-05-02)
> 目标: 将 PRD 的中国传统色设计系统映射到 shadcn/ui 的 CSS 变量 + Tailwind 令牌体系

---

## 一、设计令牌系统 (Design Tokens)

### 1.1 中国传统色 → shadcn CSS 变量映射

shadcn/ui 使用 HSL 格式 (`H S% L%`)。将 PRD 中定义的 HEX 色值转换为 HSL：

| Token | 中国传统色 | HEX | HSL (用于 shadcn) | 用途 |
|-------|-----------|-----|-------------------|------|
| `--primary` | 黛蓝 | #4A6FA5 | `214 39% 47%` | 主按钮、主色调 |
| `--destructive` | 朱砂 | #C04851 | `355 48% 52%` | 强调/破坏性操作 |
| `--accent` (custom) | 紫金 | #B7A57A | `42 30% 60%` | 成就/奖励色 |
| `--background` | 米白 | #FAF8F1 | `40 47% 96%` | 页面背景 (宣纸质感) |
| `--card` | 白 | #FFFFFF | `0 0% 100%` | 卡片背景 |
| `--foreground` | 墨色 | #2D2D2D | `0 0% 18%` | 正文文字 |
| `--muted` | 浅灰 | #F0EDE5 | `40 20% 92%` | 次要背景 |
| `--muted-foreground` | 灰字 | #8B8680 | `30 5% 52%` | 辅助文字 |
| `--border` | 浅褐 | #D9D0C1 | `38 24% 80%` | 边框 |

### 1.2 布鲁姆六层配色系统

| 层级 | 名称 | HEX | HSL (Tailwind) | shadcn Badge 类 |
|------|------|-----|----------------|-----------------|
| L1 | 记忆 | #4A6FA5 | `214 39% 47%` | `bg-bloom-1 text-white` |
| L2 | 理解 | #5B8C8D | `181 21% 45%` | `bg-bloom-2 text-white` |
| L3 | 应用 | #6B8E6B | `120 14% 49%` | `bg-bloom-3 text-white` |
| L4 | 分析 | #C17817 | `34 78% 42%` | `bg-bloom-4 text-white` |
| L5 | 评价 | #C04851 | `355 48% 52%` | `bg-bloom-5 text-white` |
| L6 | 创造 | #B7A57A | `42 30% 60%` | `bg-bloom-6 text-white` |

### 1.3 字体系统

```
--font-heading: 'LXGW WenKai', '霞鹜文楷', serif       // 标题: 霞鹜文楷
--font-body: 'Source Han Sans SC', '思源黑体', sans-serif  // 正文: 思源黑体
--font-mono: 'JetBrains Mono', monospace                   // 代码
```

### 1.4 间距与圆角

```
--radius: 0.75rem    // 12px — PRD 指定的卡片圆角
--radius-sm: 0.5rem  // 8px — 按钮/输入框
--radius-lg: 1rem    // 16px — 大卡片/弹窗
```

### 1.5 完整 globals.css 主题

```css
@layer base {
  :root {
    /* 墨韵学堂 — 浅色主题 */
    --background: 40 47% 96%;        /* 米白 #FAF8F1 */
    --foreground: 0 0% 18%;          /* 墨色 #2D2D2D */
    --card: 0 0% 100%;               /* 白色卡片 */
    --card-foreground: 0 0% 18%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 18%;
    --primary: 214 39% 47%;          /* 黛蓝 #4A6FA5 */
    --primary-foreground: 0 0% 100%;
    --secondary: 40 20% 92%;         /* 浅灰 #F0EDE5 */
    --secondary-foreground: 0 0% 18%;
    --muted: 40 20% 92%;
    --muted-foreground: 30 5% 52%;   /* 灰字 #8B8680 */
    --accent: 42 30% 60%;            /* 紫金 #B7A57A */
    --accent-foreground: 0 0% 100%;
    --destructive: 355 48% 52%;      /* 朱砂 #C04851 */
    --destructive-foreground: 0 0% 100%;
    --border: 38 24% 80%;            /* 浅褐 #D9D0C1 */
    --input: 38 24% 80%;
    --ring: 214 39% 47%;             /* 聚焦环: 黛蓝 */
    --radius: 0.75rem;

    /* 布鲁姆六层 (自定义令牌) */
    --bloom-1: 214 39% 47%;   /* 黛蓝 */
    --bloom-2: 181 21% 45%;   /* 天青 */
    --bloom-3: 120 14% 49%;   /* 竹青 */
    --bloom-4: 34 78% 42%;    /* 赭石 */
    --bloom-5: 355 48% 52%;   /* 朱砂 */
    --bloom-6: 42 30% 60%;    /* 紫金 */

    /* 侧边栏 */
    --sidebar: 0 0% 18%;            /* 墨色侧边栏 */
    --sidebar-foreground: 40 47% 96%;
    --sidebar-primary: 214 39% 47%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 0 0% 25%;
    --sidebar-accent-foreground: 40 47% 96%;
    --sidebar-border: 0 0% 25%;
    --sidebar-ring: 214 39% 47%;

    /* 图表色 */
    --chart-1: 214 39% 47%;
    --chart-2: 181 21% 45%;
    --chart-3: 120 14% 49%;
    --chart-4: 34 78% 42%;
    --chart-5: 355 48% 52%;
    --chart-6: 42 30% 60%;
  }

  .dark {
    --background: 240 10% 10%;       /* 墨灰 #1A1A2E */
    --foreground: 40 47% 96%;
    --card: 240 10% 14%;
    --card-foreground: 40 47% 96%;
    --popover: 240 10% 14%;
    --popover-foreground: 40 47% 96%;
    --primary: 214 39% 60%;          /* 浅黛蓝 */
    --primary-foreground: 240 10% 10%;
    --secondary: 240 10% 20%;
    --secondary-foreground: 40 47% 96%;
    --muted: 240 10% 20%;
    --muted-foreground: 30 5% 65%;
    --accent: 42 30% 55%;
    --accent-foreground: 240 10% 10%;
    --destructive: 355 48% 55%;
    --destructive-foreground: 40 47% 96%;
    --border: 240 10% 25%;
    --input: 240 10% 25%;
    --ring: 214 39% 60%;
  }
}
```

---

## 二、shadcn/ui 组件清单 (按角色/页面)

### 2.1 全局布局组件

| shadcn 组件 | 用途 | PRD 对应 |
|-------------|------|----------|
| `Sidebar` (collapsible: icon) | 角色感知导航侧边栏 | §3 功能架构 |
| `SidebarTrigger` | 移动端侧边栏切换 | §6.4 响应式 |
| `Sheet` | 移动端抽屉式导航 | §6.4 平板端 |
| `Breadcrumb` | 面包屑导航 | 深层页面 |
| `Avatar` | 用户头像 (姓名缩写) | 个人中心 |
| `Badge` (custom colors) | 布鲁姆六层徽章 | §6.2 层级配色 |
| `DropdownMenu` | 用户菜单、操作菜单 | 全局 |

### 2.2 学生端组件

| 页面 | shadcn 组件 | 用途 |
|------|------------|------|
| 对话页 | `Card` + `ScrollArea` | 消息气泡容器 |
| 对话页 | `Textarea` + `Button` | 输入区域 + 发送按钮 |
| 对话页 | `Badge` (bloom variant) | 布鲁姆层级印章徽章 |
| 对话页 | `Skeleton` | AI 回答加载态 |
| 项目列表 | `SidebarGroup` items | 左侧项目列表 |
| 项目列表 | `Progress` | 认知层级进度条 |
| 认知路径 | `Card` (阶梯式布局) | 六层台阶容器 |
| 认知路径 | `Tooltip` | 节点 hover 信息 |
| 认知路径 | 自定义 SVG/CSS 阶梯 | 布鲁姆阶梯图 |
| 挑战页 | `Card` (大面积留白) | 题目卡片 |
| 挑战页 | `Progress` (竖直) | 层级进度 |
| 挑战页 | `Dialog` | 挑战结果弹窗 |
| 挑战页 | `Toast` | 层级突破通知 |
| 个人中心 | `Card` (grid) | 项目卡片网格 |
| 个人中心 | `Tabs` | 项目总览/认知画像 |
| 个人中心 | 自定义 RadarChart | 认知雷达图 (用 chart-1~6) |
| 个人中心 | `Select` | 排序下拉 |

### 2.3 教师端组件

| 页面 | shadcn 组件 | 用途 |
|------|------------|------|
| 对话页 | `Select` (preset picker) | System Instruction 选择 |
| 对话页 | `Card` + `ScrollArea` | 对话区域 |
| 审计页 | `Resizable` (三栏布局) | 学生列表 \| 对话 \| 审计面板 |
| 审计页 | `Table` / `DataTable` | 待审计记录列表 |
| 审计页 | `Tabs` (SFT / DPO) | 标注类型切换 |
| 审计页 | `Textarea` | 修正答案输入 |
| 审计页 | `Badge` (status) | 审计状态标签 |
| 审计页 | `RadioGroup` | AI 回答质量判断 |
| 学情看板 | `Table` (heatmap) | 班级认知分布热力图 |
| 学情看板 | `Card` (stats) | 班级统计卡片 |

### 2.4 管理端组件

| 页面 | shadcn 组件 | 用途 |
|------|------------|------|
| 全局 | `Sidebar` (admin nav) | 管理导航 |
| 用户管理 | `DataTable` (sort/filter/page) | 用户列表 |
| 用户管理 | `Dialog` | 创建/编辑用户 |
| 用户管理 | `Input` (type=file) | CSV 上传 |
| 用户管理 | `Table` (preview) | CSV 预览+行级错误 |
| 用户管理 | `Progress` | 导入进度 |
| Provider 配置 | `Card` (list) | Provider 卡片列表 |
| Provider 配置 | `Dialog` (form) | 添加/编辑 Provider |
| Provider 配置 | `Select` | 模型路由分配 |
| Provider 配置 | `Switch` | 启用/禁用 |
| MCP 管理 | `Card` + `Switch` | MCP Server 卡片 |
| Prompt 预设 | `DataTable` | 预设列表 |
| Prompt 预设 | `Dialog` (split pane) | 编辑界面 (左编辑/右预览) |
| 数据集导出 | `DataTable` + `Checkbox` | 选择导出记录 |
| 数据集导出 | `Select` (SFT/DPO) | 导出格式 |
| 数据集导出 | `DatePicker` | 时间范围筛选 |

---

## 三、核心页面布局设计

### 3.1 全局 Shell: Sidebar + Main

```
┌──────────────────────────────────────────────────┐
│ Sidebar (collapsible: icon)                       │
│ ┌──────────────┐ ┌──────────────────────────────┐ │
│ │ 文韵智途 Logo │ │ Breadcrumb: 学生 > 《咏鹅》   │ │
│ │ ──────────── │ │                              │ │
│ │ ● 对话        │ │  <main content>              │ │
│ │ ● 项目        │ │                              │ │
│ │ ● 挑战        │ │                              │ │
│ │ ● 我的        │ │                              │ │
│ │ ──────────── │ │                              │ │
│ │ ⚙ 设置        │ │                              │ │
│ │              │ │                              │ │
│ │ Avatar + 角色 │ │                              │ │
│ └──────────────┘ └──────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

实现:
```tsx
// app/layout.tsx
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="w-full">
        <header className="flex items-center gap-2 px-4 py-3 border-b">
          <SidebarTrigger />
          <Breadcrumb items={breadcrumbs} />
          <div className="ml-auto flex items-center gap-2">
            <RoleBadge role={user.role} />
            <Avatar name={user.display_name} />
          </div>
        </header>
        {children}
      </main>
    </SidebarProvider>
  );
}
```

### 3.2 角色感知侧边栏

```tsx
// components/app-sidebar.tsx
export function AppSidebar() {
  const { role } = useUser();

  const studentNav = [
    { icon: MessageSquare, label: '对话', href: '/student' },
    { icon: FolderOpen, label: '项目', href: '/student/projects' },
    { icon: Swords, label: '挑战', href: '/student/challenge' },
    { icon: User, label: '我的', href: '/student/me' },
  ];

  const teacherNav = [
    { icon: MessageSquare, label: '教学对话', href: '/teacher' },
    { icon: FileSearch, label: '审计标注', href: '/teacher/audit' },
    { icon: BarChart3, label: '学情看板', href: '/teacher/analytics' },
  ];

  const adminNav = [
    { icon: Users, label: '用户管理', href: '/admin' },
    { icon: School, label: '班级管理', href: '/admin/classes' },
    { icon: Cpu, label: 'Provider 配置', href: '/admin/providers' },
    { icon: Puzzle, label: 'MCP 管理', href: '/admin/mcp' },
    { icon: FileText, label: 'Prompt 预设', href: '/admin/presets' },
    { icon: Download, label: '数据集导出', href: '/admin/exports' },
  ];

  const items = role === 'student' ? studentNav : role === 'teacher' ? teacherNav : adminNav;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="font-heading text-lg">文韵智途</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {items.map(item => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
```

### 3.3 学生端 — 对话页 (PRD §6.3.1)

```
┌────────────────────────────────────────────────────────┐
│  ◀ 返回    《咏鹅》- 关于白描手法       <Badge>L4 分析  │
├─────────────┬──────────────────────────────────────────┤
│ 项目列表     │                                          │
│ (可选收起)   │  [L2 理解] ← BloomBadge (印章样式)      │
│             │  ┌─────────────────────────────┐         │
│ ▸《咏鹅》   │  │ 鹅鹅鹅曲项向天歌用了什么    │         │
│  L4 分析    │  │ 样的表达手法？              │         │
│             │  └─────────────────────────────┘         │
│ ▸《静夜思》 │                                          │
│  L3 应用    │  ┌─────────────────────────────┐         │
│             │  │ 这首诗主要使用了白描的手法...│         │
│             │  │ "白毛浮绿水，红掌拨清波"    │         │
│             │  └─────────────────────────────┘         │
│             │                                          │
│             │  💡 提示卡片: 可尝试分析与《画》         │
│             │     的写法异同，进入"分析"层级            │
│             │                                          │
│             │  ┌─────────────────────────────────┐     │
│             │  │ 输入你的问题...           发送 ▶ │     │
│             │  └─────────────────────────────────┘     │
└─────────────┴──────────────────────────────────────────┘
```

组件结构:
```tsx
// app/student/[conversationId]/page.tsx
export default function StudentChatPage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 左侧项目列表 - 可折叠 */}
      <aside className="w-64 border-r p-4 hidden lg:block">
        <ProjectList projects={projects} />
        <Button variant="outline" className="mt-4 w-full">
          + 新对话
        </Button>
      </aside>

      {/* 右侧对话区域 */}
      <div className="flex-1 flex flex-col">
        {/* 对话标题栏 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Button variant="ghost" size="icon"><ChevronLeft /></Button>
          <h1 className="font-heading text-lg">{conversation.title}</h1>
          <BloomBadge level={project.maxBloomLevel} />
          <Link href={`/student/projects/${project.id}/path`}>
            <Button variant="outline" size="sm">📊 认知路径</Button>
          </Link>
        </div>

        {/* 消息列表 */}
        <ScrollArea className="flex-1 px-4 py-6">
          {messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </ScrollArea>

        {/* 输入区域 */}
        <div className="border-t p-4">
          <ChatInput conversationId={conversationId} />
        </div>
      </div>
    </div>
  );
}
```

### 3.4 学生端 — 认知路径详情页 (PRD §6.3.2)

阶梯式路径图 — 自定义组件，用 CSS Grid + shadcn Card 实现:

```tsx
// components/workbench/BloomLadder.tsx
export function BloomLadder({ levels }: { levels: BloomLevelData[] }) {
  return (
    <div className="relative py-12">
      {/* L6 在顶部, L1 在底部 */}
      <div className="grid gap-4 max-w-lg mx-auto">
        {[...levels].reverse().map((level, i) => (
          <div key={level.name} className="flex items-center gap-4">
            {/* 层级标签 */}
            <div
              className="w-24 text-right font-heading text-sm"
              style={{ color: `hsl(var(--bloom-${6 - i}))` }}
            >
              L{6 - i} {level.label}
            </div>

            {/* 台阶 */}
            <Card className={cn(
              'flex-1 p-3 transition-all hover:-translate-y-0.5 hover:shadow-md',
              level.questions.length === 0 && 'border-dashed opacity-40'
            )}>
              <div className="flex gap-2 flex-wrap">
                {level.questions.map(q => (
                  <Tooltip key={q.id} content={q.text}>
                    <div
                      className="size-8 rounded-full"
                      style={{ background: `hsl(var(--bloom-${6 - i}))` }}
                    />
                  </Tooltip>
                ))}
              </div>
              {level.questions.length === 0 && (
                <span className="text-muted-foreground text-sm">🔒 未解锁</span>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 3.5 学生端 — 挑战页面 (PRD §6.3.3)

```tsx
// app/student/challenge/[projectId]/page.tsx
export default function ChallengePage() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      {/* 进度条 */}
      <BloomProgressBar current={4} target={5} />

      {/* 题目卡片 */}
      <Card className="p-8 my-8">
        <div className="flex items-center gap-3 mb-6">
          <BloomBadge level={5} size="lg" />
          <h2 className="font-heading text-2xl">L5 评价层级挑战</h2>
        </div>
        <p className="text-lg leading-relaxed">
          {question.text}
        </p>
      </Card>

      {/* 作答区域 */}
      <Card className="p-6">
        <Textarea
          placeholder="在此作答..."
          className="min-h-32 mb-4"
          value={answer}
          onChange={setAnswer}
        />
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={showHint}>需要提示</Button>
          <Button onClick={submitAnswer}>提交答案</Button>
        </div>
      </Card>

      {/* 挑战成功 Dialog */}
      <Dialog open={showSuccess}>
        <DialogContent className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <DialogTitle>层级突破!</DialogTitle>
          <DialogDescription>
            你已从 L4 分析 攀升至 L5 评价
          </DialogDescription>
          <div className="flex gap-3 justify-center mt-4">
            <Button onClick={continueChallenge}>继续挑战</Button>
            <Button variant="outline" onClick={goBack}>返回</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

### 3.6 个人中心 — 项目卡片网格 (PRD §6.3.4)

```tsx
// app/student/me/page.tsx
export default function StudentProfilePage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="font-heading text-2xl mb-6">我的学习</h1>

      {/* 认知画像 */}
      <Card className="p-6 mb-8">
        <h2 className="font-heading text-lg mb-4">📊 认知画像</h2>
        <div className="flex items-center gap-8">
          <BloomRadarChart data={bloomProfile} className="w-64 h-64" />
          <p className="text-muted-foreground">
            建议：你在"分析"和"评价"层级还有提升空间 📈
          </p>
        </div>
      </Card>

      {/* 项目卡片网格 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg">📚 我的项目</h2>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">最近学习</SelectItem>
            <SelectItem value="depth">认知深度</SelectItem>
            <SelectItem value="count">问题数量</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

// components/dashboard/ProjectCard.tsx
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Card className="hover:-translate-y-0.5 hover:shadow-md transition-all">
      <CardHeader>
        <CardTitle className="font-heading">{project.title}</CardTitle>
        <CardDescription>{project.author} · {project.dynasty}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* 缩略版认知阶梯 */}
        <BloomMiniBar levels={project.bloomLevels} />
        <div className="flex items-center justify-between mt-4 text-sm">
          <BloomBadge level={project.maxLevel} />
          <span className="text-muted-foreground">
            {project.questionCount} 题 · {project.passedChallenges}/6 通过
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

### 3.7 教师端 — 三栏审计布局 (PRD §4.4.2)

```tsx
// app/teacher/audit/page.tsx
export default function TeacherAuditPage() {
  return (
    <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-3.5rem)]">
      {/* 左: 学生列表 */}
      <ResizablePanel defaultSize={20} minSize={15}>
        <div className="p-4 border-r h-full">
          <h2 className="font-heading text-lg mb-4">学生列表</h2>
          {students.map(student => (
            <StudentAuditItem key={student.id} student={student} />
          ))}
        </div>
      </ResizablePanel>

      {/* 中: 对话记录 (只读) */}
      <ResizablePanel defaultSize={45}>
        <ScrollArea className="h-full p-4">
          <AuditConversationView messages={selectedConversation} />
        </ScrollArea>
      </ResizablePanel>

      {/* 右: 审计面板 */}
      <ResizablePanel defaultSize={35} minSize={25}>
        <div className="p-4 border-l h-full">
          <h2 className="font-heading text-lg mb-4">审计标注</h2>
          <Tabs defaultValue="sft">
            <TabsList>
              <TabsTrigger value="sft">SFT 标注</TabsTrigger>
              <TabsTrigger value="dpo">DPO 标注</TabsTrigger>
            </TabsList>
            <TabsContent value="sft">
              {/* AI 回答质量 */}
              <div className="mb-4">
                <label className="text-sm font-medium">AI 回答质量</label>
                <RadioGroup className="mt-2">
                  <RadioGroupItem value="accurate">准确</RadioGroupItem>
                  <RadioGroupItem value="incorrect">有误</RadioGroupItem>
                </RadioGroup>
              </div>
              {/* 修正答案 */}
              <div className="mb-4">
                <label className="text-sm font-medium">修正后答案</label>
                <Textarea className="mt-2 min-h-24" placeholder="如有错误，填写修正答案..." />
              </div>
              <Button className="w-full">提交 SFT 标注</Button>
            </TabsContent>
            <TabsContent value="dpo">
              <div className="mb-4">
                <label className="text-sm font-medium">Preferred (偏好答案)</label>
                <Textarea className="mt-2 min-h-24" />
              </div>
              <div className="mb-4">
                <label className="text-sm font-medium">Rejected (拒绝答案)</label>
                <Textarea className="mt-2 min-h-24" />
              </div>
              <Button className="w-full">提交 DPO 标注</Button>
            </TabsContent>
          </Tabs>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

### 3.8 管理端 — Provider 配置页 (PRD §6.3.6)

```tsx
// app/admin/providers/page.tsx
export default function ProviderConfigPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl">模型 Provider 配置</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>+ 添加 Provider</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>添加 Provider</DialogTitle>
            {/* Provider form: type select, base URL, API key, models */}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {providers.map(provider => (
          <Card key={provider.id}>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{provider.name}</CardTitle>
                <CardDescription>
                  类型: {provider.type} · Base URL: {provider.baseUrl}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={provider.connected ? 'default' : 'destructive'}>
                  {provider.connected ? '● 已连接' : '● 断开'}
                </Badge>
                <Switch checked={provider.enabled} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">可用模型</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {provider.models.map(m => (
                      <Badge key={m} variant="secondary">{m}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">用途分配</label>
                  <Select value={provider.defaultRoute}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student_chat">学生对话</SelectItem>
                      <SelectItem value="teacher_chat">教师对话</SelectItem>
                      <SelectItem value="bloom_classification">布鲁姆标注</SelectItem>
                      <SelectItem value="project_classification">篇目识别</SelectItem>
                      <SelectItem value="practice_generation">挑战出题</SelectItem>
                      <SelectItem value="practice_evaluation">挑战评判</SelectItem>
                      <SelectItem value="embedding">向量嵌入</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## 四、布鲁姆组件设计系统

### 4.1 BloomBadge — 印章式徽章

```tsx
// components/workbench/BloomBadge.tsx
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const bloomVariants: Record<number, string> = {
  1: 'bg-[hsl(var(--bloom-1))] text-white hover:bg-[hsl(var(--bloom-1))]',
  2: 'bg-[hsl(var(--bloom-2))] text-white hover:bg-[hsl(var(--bloom-2))]',
  3: 'bg-[hsl(var(--bloom-3))] text-white hover:bg-[hsl(var(--bloom-3))]',
  4: 'bg-[hsl(var(--bloom-4))] text-white hover:bg-[hsl(var(--bloom-4))]',
  5: 'bg-[hsl(var(--bloom-5))] text-white hover:bg-[hsl(var(--bloom-5))]',
  6: 'bg-[hsl(var(--bloom-6))] text-white hover:bg-[hsl(var(--bloom-6))]',
};

const bloomLabels: Record<number, string> = {
  1: '记忆', 2: '理解', 3: '应用',
  4: '分析', 5: '评价', 6: '创造',
};

export function BloomBadge({ level, size = 'md' }: { level: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Badge
      className={cn(
        bloomVariants[level],
        'font-heading tracking-wider border-2 border-current/20',
        'shadow-sm',
      )}
      style={{
        // 印章式设计: 圆角方形 + 文字竖排感
        fontFamily: 'var(--font-heading)',
      }}
    >
      L{level} {bloomLabels[level]}
    </Badge>
  );
}
```

### 4.2 BloomProgress — 认知层级进度条

```tsx
// components/workbench/BloomProgress.tsx
export function BloomProgress({ levels, current }: { levels: BloomLevelData[]; current: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5, 6].map(level => (
        <div key={level} className="flex-1">
          <Tooltip content={`L${level} ${bloomLabels[level]}`}>
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                levels[level - 1]?.count > 0
                  ? `bg-[hsl(var(--bloom-${level}))]`
                  : 'bg-muted',
                level === current && 'ring-2 ring-offset-1 ring-[hsl(var(--bloom-5))]'
              )}
            />
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
```

### 4.3 BloomRadarChart — 认知雷达图

使用 shadcn 的 chart CSS 变量与 Recharts (推荐) 或纯 SVG:

```tsx
// components/workbench/BloomRadarChart.tsx
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';

export function BloomRadarChart({ data }: { data: { level: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <RadarChart data={data}>
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="level"
          tick={{ fill: 'hsl(var(--foreground))', fontFamily: 'var(--font-heading)' }}
        />
        <Radar
          name="认知分布"
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary) / 0.2)"
          fillOpacity={0.6}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

---

## 五、状态设计规范

### 5.1 每个页面必须覆盖的状态

| 状态 | 组件 | 实现 |
|------|------|------|
| **加载中** | `Skeleton` | 卡片/列表骨架屏，匹配实际内容形状 |
| **空状态** | 自定义 EmptyState | 角色相关插图 + 友好提示 + CTA 按钮 |
| **错误** | `Alert` variant="destructive" | 错误信息 + 重试按钮 |
| **流式加载** | 文本逐字显示 | AI SDK useChat 的 streaming 默认行为 |
| **工具调用中** | 自定义 ToolCallCard | "正在检索古诗文..." + Skeleton |
| **未认证** | Redirect to /login | middleware 路由保护 |
| **无权限** | 403 页面 | "此页面仅限教师访问" |
| **Provider 未配置** | `Alert` variant="warning" | "请管理员先配置 AI 模型" + 跳转链接 |

### 5.2 Empty State 模板

```tsx
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <h3 className="font-heading text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-sm mb-4">{description}</p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
```

### 5.3 配置缺失状态

```tsx
export function ProviderMissingAlert() {
  return (
    <Alert variant="default" className="border-yellow-200 bg-yellow-50">
      <AlertTriangle className="size-4" />
      <AlertTitle>模型 Provider 未配置</AlertTitle>
      <AlertDescription>
        AI 功能需要管理员先配置模型服务。
        <Link href="/admin/providers">
          <Button variant="link" size="sm">前往配置</Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
```

---

## 六、响应式断点策略

| 断点 | 宽度 | 布局 |
|------|------|------|
| Desktop | ≥1280px | 完整三栏/双栏 + Sidebar |
| Tablet | 768-1279px | Sidebar 折叠为 icon 模式; 审计页两栏 |
| Mobile | <768px | Sheet 抽屉导航; 单栏; 底部 Tab |

```tsx
// 移动端底部 Tab 导航 (仅学生端)
export function MobileBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background lg:hidden">
      <div className="flex justify-around py-2">
        <NavItem icon={MessageSquare} label="对话" href="/student" />
        <NavItem icon={FolderOpen} label="项目" href="/student/projects" />
        <NavItem icon={Swords} label="挑战" href="/student/challenge" />
        <NavItem icon={User} label="我的" href="/student/me" />
      </div>
    </nav>
  );
}
```

---

## 七、动画定义

### 7.1 Tailwind 动画配置

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      animation: {
        'bloom-up': 'bloomUp 0.6s ease-out',
        'card-hover': 'cardHover 0.2s ease-out',
        'badge-seal': 'badgeSeal 0.3s ease-out',
        'golden-spark': 'goldenSpark 1s ease-out',
      },
      keyframes: {
        bloomUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        cardHover: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-2px)' },
        },
        badgeSeal: {
          '0%': { transform: 'scale(0.8) rotate(-6deg)', opacity: '0' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        goldenSpark: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '50%': { transform: 'scale(1.2)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
};
```

### 7.2 挑战成功动画

```tsx
// 层阶突破动画 — CSS + framer-motion
<motion.div
  initial={{ scale: 0.5, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
>
  <div className="text-6xl">🏆</div>
  <p className="font-heading text-xl text-[hsl(var(--bloom-6))]">
    L{prevLevel} → L{newLevel} 层级突破!
  </p>
</motion.div>
```

---

## 八、shadcn 组件安装清单

实施时按此顺序安装:

```bash
# 基础 (Phase 1)
npx shadcn@latest add button card input textarea badge
npx shadcn@latest add avatar dropdown-menu dialog sheet
npx shadcn@latest add sidebar skeleton tooltip tabs

# 表单/数据 (Phase 2)
npx shadcn@latest add select checkbox radio-group switch
npx shadcn@latest add table datatable form label

# 高级 (Phase 3)
npx shadcn@latest add resizable scroll-area progress
npx shadcn@latest add breadcrumb separator alert
npx shadcn@latest add command popover calendar
npx shadcn@latest add toast sonner (通知)
```

---

## 九、与现有 spec 的关系

此文档是 `.trellis/spec/frontend/ui-ux-guidelines.md` 的实施级补充，包含:
- 具体的 shadcn 组件选型
- CSS 变量映射表
- 每个页面的组件结构伪代码
- 状态覆盖矩阵

实施时结合 `.trellis/spec/frontend/next-ai-sdk-guidelines.md` (AI 路由规范) 和 `.trellis/spec/backend/supabase-pgvector-guidelines.md` (数据层规范) 形成完整的前端实施指南。
