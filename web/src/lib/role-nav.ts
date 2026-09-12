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
  Building2,
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

export type Role = 'org_admin' | 'admin' | 'teacher' | 'student';

export type RoleNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 侧边栏悬停说明 */
  description?: string;
  /** 头像菜单快捷入口，同时用于学生顶栏导航。 */
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
      { icon: MessageSquare, label: '学习提问', href: '/student', description: '围绕篇目提问', primary: true },
      { icon: Swords, label: '挑战练习', href: '/student/challenge', description: '选择篇目开始练习', primary: true },
      { icon: BarChart3, label: '学习记录', href: '/student/me', description: '查看提问与挑战记录', primary: true },
    ],
  },
];

const teacherNavGroups: RoleNavGroup[] = [
  {
    label: '教学',
    items: [
      { icon: BarChart3, label: '教学总览', href: '/teacher', description: '班级学情与待办', primary: true },
      { icon: MessageSquare, label: '备课问答', href: '/teacher/chat', description: '讨论讲解思路与课堂练习', primary: true },
      { icon: FileSearch, label: '回答审核', href: '/teacher/audit', description: '核验 AI 回答与教学标签', primary: true },
    ],
  },
];

const adminNavGroups: RoleNavGroup[] = [
  {
    label: '学校管理',
    items: [
      { icon: ShieldCheck, label: '运行概览', href: '/admin', description: '账号规模与服务配置', primary: true },
      { icon: Users, label: '用户管理', href: '/admin/users', description: '创建和管理全校账号', primary: true },
      { icon: School, label: '班级管理', href: '/admin/classes', description: '分配任课教师与学生' },
    ],
  },
  {
    label: 'AI 服务',
    items: [
      { icon: Cpu, label: '模型供应商', href: '/admin/providers', description: 'Provider、Model ID 与角色路由', primary: true },
      { icon: Puzzle, label: 'MCP Server', href: '/admin/mcp', description: '连接、授权与工具白名单' },
      { icon: FileText, label: 'Prompt 预设', href: '/admin/presets', description: '系统提示词与教师模板' },
      { icon: Download, label: 'SFT / DPO 导出', href: '/admin/exports', description: '导出已审核的训练样本' },
      { icon: Activity, label: '运行日志', href: '/admin/logs', description: '请求追踪与故障诊断', primary: true },
    ],
  },
];

const orgAdminNavGroups: RoleNavGroup[] = [
  {
    label: '公司管理',
    items: [
      { icon: Building2, label: '学校总览', href: '/org', description: '旗下学校与规模', primary: true },
    ],
  },
];

export const roleNavGroups: Record<Role, RoleNavGroup[]> = {
  org_admin: orgAdminNavGroups,
  student: studentNavGroups,
  teacher: teacherNavGroups,
  admin: adminNavGroups,
};

/** 侧边栏品牌区副标题 */
export const roleSubtitle: Record<Role, string> = {
  org_admin: '公司台',
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
