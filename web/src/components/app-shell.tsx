'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronDown, LogOut } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { RoleBadge } from '@/components/workbench/role-badge';
import { roleAvatarMenuItems, roleBreadcrumbMap, type Role } from '@/lib/role-nav';

interface BreadcrumbSegment { label: string; href?: string; }
interface AppShellProps {
  role: Role;
  displayName: string;
  breadcrumbs: BreadcrumbSegment[];
  children: React.ReactNode;
  /**
   * sidebar：经典左侧栏（教师/管理端）。
   * top：无侧边栏的顶栏模式——学生端主路径是提问本身，
   * 个人中心类入口（学习情况、挑战）收敛进头像菜单，避免两级侧边栏打架。
   */
  chrome?: 'sidebar' | 'top';
}

function derivedBreadcrumbs(pathname: string, fallback: BreadcrumbSegment[]) {
  const root = fallback[0] ?? { label: '工作台' };
  const exact = roleBreadcrumbMap[pathname];
  if (exact && exact !== root.label) return [root, { label: exact }];

  if (pathname.startsWith('/teacher/audit/')) {
    return [root, { label: '学习记录核实', href: '/teacher/audit' }, { label: '核实详情' }];
  }

  return fallback;
}

export function AppShell({ role, displayName, breadcrumbs, chrome = 'sidebar', children }: AppShellProps) {
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

  const header = (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-background/82 px-4 backdrop-blur-xl sm:px-6">
      {chrome === 'sidebar' ? (
        <SidebarTrigger className="-ml-1 min-h-10 min-w-10 cursor-pointer rounded-lg" aria-label="展开或收起侧边栏" />
      ) : (
        <Link href={role === 'student' ? '/student' : roleBreadcrumbMap[`/${role}`] ? `/${role}` : '/'} className="flex shrink-0 items-center gap-2 rounded-md px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpen className="size-4" aria-hidden="true" />
          </span>
          <span className="hidden font-heading text-base sm:inline">文韵智途</span>
        </Link>
      )}
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
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex cursor-pointer items-center gap-2 rounded-full py-1 pl-1 pr-2 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted/70"
          aria-label="打开个人菜单"
        >
          <Avatar className="size-9 ring-1 ring-border">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{displayName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-24 truncate text-sm font-medium sm:inline">{displayName}</span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground sm:inline" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-0">
          {/* 用户信息块用普通 div：DropdownMenuLabel 包装的是 Base UI GroupLabel，
              必须在 Menu.Group 内，直接放 Content 下会抛 #31 砸掉整页。 */}
          <div className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3" data-slot="dropdown-menu-label">
            <Avatar className="size-10 ring-1 ring-border">
              <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">{displayName.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{displayName}</p>
              <RoleBadge role={role} className="mt-1 text-[10px]" />
            </div>
          </div>
          <div className="p-1">
            {roleAvatarMenuItems[role].map((link) => {
              const Icon = link.icon;
              return (
                <DropdownMenuItem key={link.href} render={<Link href={link.href} />} className="cursor-pointer gap-2.5 px-2.5 py-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {link.label}
                </DropdownMenuItem>
              );
            })}
          </div>
          <div className="border-t border-border/60 p-1">
            {/* 注意：Base UI MenuItem 只有 onClick，没有 Radix 式 onSelect；
              写 onSelect 会挂成 div 的文本选中事件，点击永远无响应。 */}
            <DropdownMenuItem
              variant="destructive"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              className="cursor-pointer gap-2.5 px-2.5 py-2"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isLoggingOut ? '退出中…' : '退出登录'}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );

  const errorBanner = logoutError ? (
    <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
      {logoutError}
    </div>
  ) : null;

  if (chrome === 'top') {
    return (
      <div className="flex min-h-svh flex-col">
        <a
          href="#workspace-main"
          className="sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-ink focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          跳到主要内容
        </a>
        {header}
        {errorBanner}
        <div id="workspace-main" className="flex flex-1 flex-col min-h-0" tabIndex={-1}>{children}</div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar role={role} />
      <main className="relative flex min-h-svh flex-1 flex-col overflow-hidden bg-transparent">
        <a
          href="#workspace-main"
          className="sr-only fixed left-4 top-4 z-50 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-ink focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          跳到主要内容
        </a>
        {header}
        {errorBanner}
        <div id="workspace-main" className="flex-1 scroll-mt-20" tabIndex={-1}>{children}</div>
      </main>
    </SidebarProvider>
  );
}
