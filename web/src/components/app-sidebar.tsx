'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BookOpen,
  Cpu,
  Download,
  FileSearch,
  FileText,
  FolderOpen,
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
    label: '我的学习项目',
    items: [
      { icon: MessageSquare, label: '学习提问', href: '/student', description: '自然提问并自动沉淀到篇目项目' },
      { icon: FolderOpen, label: '篇目项目', href: '/student/projects', description: '项目、会话与认知路径' },
      { icon: Swords, label: '层级挑战', href: '/student/challenge', description: '用挑战确认真实认知水平' },
      { icon: User, label: '我的画像', href: '/student/me', description: '个人布鲁姆认知概览' },
    ],
  },
];

const teacherNavGroups: NavGroup[] = [
  {
    label: '教学与核实',
    items: [
      { icon: BarChart3, label: '学情看板', href: '/teacher', description: '学生认知与待核实学习记录' },
      { icon: FileSearch, label: '学习核实', href: '/teacher/audit', description: '查看完整学习过程并修订回答' },
      { icon: MessageSquare, label: '学情线索', href: '/teacher/analytics', description: '课堂追问与学情线索' },
    ],
  },
];

const adminNavGroups: NavGroup[] = [
  {
    label: '学校管理',
    items: [
      { icon: ShieldCheck, label: '管理看板', href: '/admin', description: '学校账号、班级与权限摘要' },
      { icon: Users, label: '用户权限', href: '/admin', description: '用户、角色、状态与活跃情况' },
      { icon: School, label: '班级关系', href: '/admin/classes', description: '教师与学生归属' },
    ],
  },
  {
    label: 'AI 运维',
    items: [
      { icon: Cpu, label: 'Provider', href: '/admin/providers', description: '模型能力路由与密钥引用' },
      { icon: Puzzle, label: 'MCP', href: '/admin/mcp', description: '外部工具治理' },
      { icon: FileText, label: 'Prompt 预设', href: '/admin/presets', description: '全局预设生命周期' },
      { icon: Download, label: '教学数据导出', href: '/admin/exports', description: 'SFT JSONL、DPO JSONL、审阅元数据' },
      { icon: Activity, label: '运行日志', href: '/admin/logs', description: '错误与请求追踪' },
    ],
  },
];

const navMap: Record<Role, NavGroup[]> = { student: studentNavGroups, teacher: teacherNavGroups, admin: adminNavGroups };
const roleTitle: Record<Role, string> = { student: '学生工作台', teacher: '教师工作台', admin: '管理控制台' };

interface AppSidebarProps { role: Role; displayName: string; }

export function AppSidebar({ role, displayName }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <BookOpen className="size-5 shrink-0 text-sidebar-foreground" aria-hidden="true" />
          <div className="group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-lg leading-none">文韵智途</span>
            <p className="mt-1 text-xs text-sidebar-foreground/70">{roleTitle[role]}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navMap[role].map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(`${item.href}/`));
                return (
                  <SidebarMenuItem key={`${group.label}-${item.href}-${item.label}`}>
                    <SidebarMenuButton isActive={active} tooltip={`${item.label} · ${item.description}`} onClick={() => router.push(item.href)}>
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-xs text-sidebar-primary-foreground">{displayName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm">{displayName}</p>
            <RoleBadge role={role} className="text-[10px]" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
