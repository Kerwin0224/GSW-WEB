'use client';

import { usePathname } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { RoleBadge } from '@/components/workbench/role-badge';

type Role = 'admin' | 'teacher' | 'student';
interface BreadcrumbSegment { label: string; href?: string; }
interface AppShellProps { role: Role; displayName: string; breadcrumbs: BreadcrumbSegment[]; children: React.ReactNode; }

const breadcrumbMap: Record<string, string> = {
  '/student': '学习提问',
  '/student/projects': '篇目项目',
  '/student/challenge': '层级挑战',
  '/student/me': '我的画像',
  '/teacher': '教学对话',
  '/teacher/audit': '审计标注',
  '/teacher/analytics': '学情线索',
  '/admin': '系统就绪/用户',
  '/admin/classes': '班级关系',
  '/admin/providers': '模型 Provider',
  '/admin/mcp': 'MCP 能力',
  '/admin/presets': 'Prompt 预设',
  '/admin/exports': '数据集导出',
};

function derivedBreadcrumbs(pathname: string, fallback: BreadcrumbSegment[]) {
  const root = fallback[0] ?? { label: '工作台' };
  const exact = breadcrumbMap[pathname];
  if (exact && exact !== root.label) return [root, { label: exact }];

  if (pathname.startsWith('/student/projects/')) {
    return [root, { label: '篇目项目', href: '/student/projects' }, { label: '篇目详情' }];
  }
  if (pathname.startsWith('/teacher/audit/')) {
    return [root, { label: '审计标注', href: '/teacher/audit' }, { label: '审计详情' }];
  }

  return fallback;
}

export function AppShell({ role, displayName, breadcrumbs, children }: AppShellProps) {
  const pathname = usePathname();
  const visibleBreadcrumbs = breadcrumbs.length > 1 ? breadcrumbs : derivedBreadcrumbs(pathname, breadcrumbs);

  return (
    <SidebarProvider>
      <AppSidebar role={role} displayName={displayName} />
      <main className="flex min-h-svh flex-1 flex-col bg-background">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList>
              {visibleBreadcrumbs.map((seg, i) => (
                <span key={`${seg.label}-${i}`} className="flex items-center gap-2">
                  <BreadcrumbItem>
                    {seg.href ? <BreadcrumbLink href={seg.href}>{seg.label}</BreadcrumbLink> : <BreadcrumbPage>{seg.label}</BreadcrumbPage>}
                  </BreadcrumbItem>
                  {i < visibleBreadcrumbs.length - 1 && <BreadcrumbSeparator />}
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <RoleBadge role={role} className="hidden sm:inline-flex" />
        </header>
        <div className="flex-1">{children}</div>
      </main>
    </SidebarProvider>
  );
}
