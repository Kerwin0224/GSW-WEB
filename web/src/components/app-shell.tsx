'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
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
  '/teacher/audit': '学习记录核实',
  '/teacher/analytics': '学情线索',
  '/admin': '系统就绪/用户',
  '/admin/classes': '班级关系',
  '/admin/providers': '模型 Provider',
  '/admin/mcp': 'MCP 能力',
  '/admin/presets': 'Prompt 预设',
  '/admin/exports': '数据集导出',
  '/admin/logs': '运行日志',
};

function derivedBreadcrumbs(pathname: string, fallback: BreadcrumbSegment[]) {
  const root = fallback[0] ?? { label: '工作台' };
  const exact = breadcrumbMap[pathname];
  if (exact && exact !== root.label) return [root, { label: exact }];

  if (pathname.startsWith('/student/projects/')) {
    return [root, { label: '篇目项目', href: '/student/projects' }, { label: '篇目详情' }];
  }
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
          <Button variant="ghost" size="sm" onClick={handleLogout} disabled={isLoggingOut} aria-label="退出登录">
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{isLoggingOut ? '退出中…' : '退出登录'}</span>
          </Button>
        </header>
        {logoutError ? (
          <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
            {logoutError}
          </div>
        ) : null}
        <div className="flex-1">{children}</div>
      </main>
    </SidebarProvider>
  );
}
