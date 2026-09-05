'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { RoleBadge } from '@/components/workbench/role-badge';

type Role = 'admin' | 'teacher' | 'student';
interface BreadcrumbSegment { label: string; href?: string; }
interface AppShellProps { role: Role; displayName: string; breadcrumbs: BreadcrumbSegment[]; children: React.ReactNode; }

const breadcrumbMap: Record<string, string> = {
  '/student': '学习提问',
  '/student/challenge': '挑战确认',
  '/student/me': '学生看板',
  '/teacher': '教师看板',
  '/teacher/chat': '教师问答',
  '/teacher/audit': '学习记录核实',
  '/admin': '管理看板',
  '/admin/classes': '班级成员管理',
  '/admin/providers': '模型 Provider',
  '/admin/mcp': 'MCP 能力',
  '/admin/presets': 'Prompt 预设',
  '/admin/exports': '教学数据导出',
  '/admin/logs': '运行日志',
};

function derivedBreadcrumbs(pathname: string, fallback: BreadcrumbSegment[]) {
  const root = fallback[0] ?? { label: '工作台' };
  const exact = breadcrumbMap[pathname];
  if (exact && exact !== root.label) return [root, { label: exact }];

  if (pathname.startsWith('/teacher/audit/')) {
    return [root, { label: '学习记录核实', href: '/teacher/audit' }, { label: '核实详情' }];
  }

  return fallback;
}

export function AppShell({ role, displayName, breadcrumbs, children }: AppShellProps) {
  const pathname = usePathname();
  const visibleBreadcrumbs = breadcrumbs.length > 1 ? breadcrumbs : derivedBreadcrumbs(pathname, breadcrumbs);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError('');

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        setLogoutError('退出登录失败，请稍后再试。');
        setIsLoggingOut(false);
        return;
      }

      window.location.href = '/login';
    } catch {
      setLogoutError('退出登录失败，请稍后再试。');
      setIsLoggingOut(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar role={role} displayName={displayName} />
      <main className="relative flex min-h-svh flex-1 flex-col overflow-hidden bg-transparent">
        <a
          href="#workspace-main"
          className="sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-ink focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          跳到主要内容
        </a>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/82 px-4 backdrop-blur-xl sm:px-6">
          <SidebarTrigger className="-ml-1 min-h-10 min-w-10 cursor-pointer rounded-lg" aria-label="展开或收起侧边栏" />
          <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
            <BreadcrumbList className="flex-nowrap text-xs sm:text-sm">
              {visibleBreadcrumbs.map((seg, i) => (
                <span key={`${seg.label}-${i}`} className="flex min-w-0 items-center gap-2">
                  <BreadcrumbItem className="min-w-0">
                    {seg.href ? <BreadcrumbLink href={seg.href} className="truncate transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{seg.label}</BreadcrumbLink> : <BreadcrumbPage className="truncate font-medium">{seg.label}</BreadcrumbPage>}
                  </BreadcrumbItem>
                  {i < visibleBreadcrumbs.length - 1 && <BreadcrumbSeparator className="shrink-0" />}
                </span>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <RoleBadge role={role} className="hidden sm:inline-flex" />
          <Button variant="ghost" size="sm" onClick={handleLogout} disabled={isLoggingOut} aria-label="退出登录" className="min-h-10 cursor-pointer gap-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{isLoggingOut ? '退出中…' : '退出登录'}</span>
          </Button>
        </header>
        {logoutError ? (
          <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
            {logoutError}
          </div>
        ) : null}
        <div id="workspace-main" className="flex-1 scroll-mt-20" tabIndex={-1}>{children}</div>
      </main>
    </SidebarProvider>
  );
}
