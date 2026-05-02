'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  MessageSquare,
  FolderOpen,
  Swords,
  User,
  FileSearch,
  BarChart3,
  School,
  Cpu,
  Puzzle,
  FileText,
  Download,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';

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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RoleBadge } from '@/components/workbench/role-badge';

type Role = 'admin' | 'teacher' | 'student';

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  description: string;
}

const studentNav: NavItem[] = [
  { icon: MessageSquare, label: '学习提问', href: '/student', description: 'AI 问答与篇目归档' },
  { icon: FolderOpen, label: '篇目项目', href: '/student/projects', description: '诗文项目与认知路径' },
  { icon: Swords, label: '层级挑战', href: '/student/challenge', description: '布鲁姆练习入口' },
  { icon: User, label: '我的画像', href: '/student/me', description: '个人学习概览' },
];

const teacherNav: NavItem[] = [
  { icon: MessageSquare, label: '教学对话', href: '/teacher', description: 'Preset-first 教学助手' },
  { icon: FileSearch, label: '审计标注', href: '/teacher/audit', description: 'SFT / DPO 质量控制' },
  { icon: BarChart3, label: '学情线索', href: '/teacher/analytics', description: '班级行动摘要' },
];

const adminNav: NavItem[] = [
  { icon: ShieldCheck, label: '系统就绪/用户', href: '/admin', description: '配置状态与用户入口' },
  { icon: School, label: '班级关系', href: '/admin/classes', description: '教师与学生归属' },
  { icon: Cpu, label: '模型 Provider', href: '/admin/providers', description: '能力路由与密钥' },
  { icon: Puzzle, label: 'MCP 能力', href: '/admin/mcp', description: '外部工具治理' },
  { icon: FileText, label: 'Prompt 预设', href: '/admin/presets', description: '全局预设生命周期' },
  { icon: Download, label: '数据集导出', href: '/admin/exports', description: '审计后 JSONL' },
];

const navMap: Record<Role, NavItem[]> = { student: studentNav, teacher: teacherNav, admin: adminNav };
const roleTitle: Record<Role, string> = { student: '学生工作台', teacher: '教师工作台', admin: '管理控制台' };

interface AppSidebarProps { role: Role; displayName: string; }

export function AppSidebar({ role, displayName }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <BookOpen className="size-5 text-sidebar-foreground shrink-0" aria-hidden="true" />
          <div className="group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-lg leading-none">文韵智途</span>
            <p className="mt-1 text-xs text-sidebar-foreground/70">{roleTitle[role]}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">导航</SidebarGroupLabel>
          <SidebarMenu>
            {navMap[role].map((item) => {
              const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(`${item.href}/`));
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton isActive={active} tooltip={`${item.label} · ${item.description}`} onClick={() => router.push(item.href)}>
                    <item.icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="text-xs bg-sidebar-primary text-sidebar-primary-foreground">{displayName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="group-data-[collapsible=icon]:hidden min-w-0 flex-1">
            <p className="text-sm truncate">{displayName}</p>
            <RoleBadge role={role} className="text-[10px]" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
