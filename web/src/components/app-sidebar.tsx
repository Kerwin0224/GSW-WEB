'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BookOpen,
  Cpu,
  Download,
  FileSearch,
  FileText,
  MessageSquare,
  Puzzle,
  School,
  ShieldCheck,
  Swords,
  User,
  Users,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { RoleBadge } from '@/components/workbench/role-badge';

type Role = 'admin' | 'teacher' | 'student';

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  description: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const studentNavGroups: NavGroup[] = [
  {
    label: '学习',
    items: [
      { icon: User, label: '学习情况', href: '/student/me', description: '学习进度与认知分布' },
      { icon: MessageSquare, label: '学习提问', href: '/student', description: '提出问题，自动按篇目整理' },
      { icon: Swords, label: '挑战', href: '/student/challenge', description: '选择篇目检验学到了哪一层' },
    ],
  },
];

const teacherNavGroups: NavGroup[] = [
  {
    label: '教学',
    items: [
      { icon: BarChart3, label: '教学总览', href: '/teacher', description: '全班学情与待核实任务' },
      { icon: MessageSquare, label: '教师问答', href: '/teacher/chat', description: '备课提问，和 AI 讨论教学' },
      { icon: FileSearch, label: '学习记录核实', href: '/teacher/audit', description: '逐条核实学生的 AI 对话' },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
  {
    label: '学校管理',
    items: [
      { icon: ShieldCheck, label: '管理看板', href: '/admin', description: '账号、班级与 AI 服务状态' },
      { icon: Users, label: '用户管理', href: '/admin/users', description: '创建和管理全校账号' },
      { icon: School, label: '班级成员管理', href: '/admin/classes', description: '安排教师和学生的班级' },
    ],
  },
  {
    label: 'AI 服务',
    items: [
      { icon: Cpu, label: '模型接入', href: '/admin/providers', description: '配置 AI 模型与调用方式' },
      { icon: Puzzle, label: '外部工具', href: '/admin/mcp', description: '管理 AI 可用的外部工具' },
      { icon: FileText, label: '提示词预设', href: '/admin/presets', description: '维护教师问答的提示词模板' },
      { icon: Download, label: '教学数据导出', href: '/admin/exports', description: '导出教师确认过的样本' },
      { icon: Activity, label: '运行日志', href: '/admin/logs', description: '排查系统问题' },
    ],
  },
];

const navMap: Record<Role, NavGroup[]> = { student: studentNavGroups, teacher: teacherNavGroups, admin: adminNavGroups };
const roleTitle: Record<Role, string> = { student: '学习台', teacher: '教学台', admin: '管理后台' };

interface AppSidebarProps { role: Role; displayName: string; }

export function AppSidebar({ role, displayName }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-3 py-4">
        <div className="rounded-[1.4rem] border border-sidebar-border/80 bg-sidebar-accent/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_-30px_rgba(0,0,0,0.85)] group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-white/10">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-heading text-xl leading-none tracking-tight">文韵智途</span>
              <p className="mt-1 truncate text-xs text-sidebar-foreground/70">{roleTitle[role]}</p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1 pb-2">
        {navMap[role].map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(`${item.href}/`));
                return (
                  <SidebarMenuItem key={`${group.label}-${item.href}-${item.label}`}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={`${item.label} · ${item.description}`}
                      render={<Link href={item.href} />}
                      className="h-12 cursor-pointer rounded-lg px-3 text-sidebar-foreground/82 transition-[background,color,box-shadow] duration-200 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground data-active:bg-sidebar-primary/16 data-active:text-sidebar-foreground data-active:shadow-[inset_3px_0_0_var(--sidebar-primary),0_12px_30px_-26px_rgba(0,0,0,0.8)] group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:px-2"
                    >
                      <item.icon className="size-4" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/70 p-3">
        <div className="flex items-center gap-3 rounded-[1.3rem] border border-sidebar-border/65 bg-sidebar-accent/40 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none">
          <Avatar className="size-10 shrink-0 ring-1 ring-sidebar-border">
            <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">{displayName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium leading-5">{displayName}</p>
            <RoleBadge role={role} className="mt-1 text-[10px]" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
