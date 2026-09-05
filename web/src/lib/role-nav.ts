/**
 * role-nav.ts
 *
 * 角色导航的唯一事实源。侧边栏分组、面包屑映射、头像菜单快捷入口
 * 都从这里派生——改导航只改这一个文件，三类出口一次生效。
 * （此前同一个"路由→标签"事实在 app-sidebar / app-shell 的
 * breadcrumbMap / avatarMenuLinks 里各写一份，改名要同步三处。）
 */

import {
  Activity,
  BarChart3,
  Cpu,
  Download,
  FileSearch,
  FileText,
  MessageSquare,
  Puzzle,
  School,
  ShieldCheck,
  Swords,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type Role = 'admin' | 'teacher' | 'student';

export type RoleNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 侧边栏悬停说明 */
  description?: string;
  /** 是否进入头像菜单的快捷入口（学生端无侧边栏，菜单是唯一导航位） */
  primary?: boolean;
};

export type RoleNavGroup = {
  label: string;
  items: RoleNavItem[];
};

const studentNavGroups: RoleNavGroup[] = [
  {
    label: '学习',
    items: [
      { icon: BarChart3, label: '学习情况', href: '/student/me', description: '学习进度与认知分布', primary: true },
      { icon: MessageSquare, label: '学习提问', href: '/student', description: '提出问题，自动按篇目整理' },
      { icon: Swords, label: '挑战', href: '/student/challenge', description: '选择篇目检验学到了哪一层', primary: true },
    ],
  },
];

const teacherNavGroups: RoleNavGroup[] = [
  {
    label: '教学',
    items: [
      { icon: BarChart3, label: '教学总览', href: '/teacher', description: '全班学情与待核实任务', primary: true },
      { icon: MessageSquare, label: '教师问答', href: '/teacher/chat', description: '备课提问，和 AI 讨论教学', primary: true },
      { icon: FileSearch, label: '学习记录核实', href: '/teacher/audit', description: '逐条核实学生的 AI 对话', primary: true },
    ],
  },
];

const adminNavGroups: RoleNavGroup[] = [
  {
    label: '学校管理',
    items: [
      { icon: ShieldCheck, label: '管理看板', href: '/admin', description: '账号、班级与 AI 服务状态', primary: true },
      { icon: Users, label: '用户管理', href: '/admin/users', description: '创建和管理全校账号', primary: true },
      { icon: School, label: '班级成员管理', href: '/admin/classes', description: '安排教师和学生的班级' },
    ],
  },
  {
    label: 'AI 服务',
    items: [
      { icon: Cpu, label: '模型接入', href: '/admin/providers', description: '配置 AI 模型与调用方式', primary: true },
      { icon: Puzzle, label: '外部工具', href: '/admin/mcp', description: '管理 AI 可用的外部工具' },
      { icon: FileText, label: '提示词预设', href: '/admin/presets', description: '维护教师问答的提示词模板' },
      { icon: Download, label: '教学数据导出', href: '/admin/exports', description: '导出教师确认过的样本' },
      { icon: Activity, label: '运行日志', href: '/admin/logs', description: '排查系统问题', primary: true },
    ],
  },
];

export const roleNavGroups: Record<Role, RoleNavGroup[]> = {
  student: studentNavGroups,
  teacher: teacherNavGroups,
  admin: adminNavGroups,
};

/** 侧边栏品牌区副标题 */
export const roleSubtitle: Record<Role, string> = {
  student: '学习台',
  teacher: '教学台',
  admin: '管理后台',
};

/** 路由 → 面包屑标签，从导航分组派生，保证与侧边栏永远同名。 */
export const roleBreadcrumbMap: Record<string, string> = Object.fromEntries(
  Object.values(roleNavGroups).flatMap((groups) =>
    groups.flatMap((group) => group.items.map((item) => [item.href, item.label] as const)),
  ),
);

/** 头像菜单快捷入口：各分组里标了 primary 的项，按分组顺序摊平。 */
export const roleAvatarMenuItems = Object.fromEntries(
  (Object.keys(roleNavGroups) as Role[]).map((role) => [
    role,
    roleNavGroups[role].flatMap((group) => group.items.filter((item) => item.primary)),
  ]),
) as Record<Role, RoleNavItem[]>;
