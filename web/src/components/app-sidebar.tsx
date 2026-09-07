'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useSidebar } from '@/components/ui/sidebar';
import { roleNavGroups, roleSubtitle, type Role } from '@/lib/role-nav';

interface AppSidebarProps { role: Role; }

export function AppSidebar({ role }: AppSidebarProps) {
  const pathname = usePathname();
  const { state, isMobile, toggleSidebar, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === 'collapsed';
  const toggleLabel = isMobile ? '关闭导航' : collapsed ? '展开侧边栏' : '收起侧边栏';

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <div className="flex min-h-12 items-center gap-2 group-data-[collapsible=icon]:justify-center">
          {!collapsed ? <Link href={`/${role}`} onClick={() => setOpenMobile(false)} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <BookOpen className="size-5 shrink-0 text-sidebar-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-heading text-lg leading-tight">文韵智途</span>
              <span className="block truncate text-xs text-sidebar-foreground/70">{roleSubtitle[role]}</span>
            </span>
          </Link> : null}
          <button type="button" onClick={toggleSidebar} title={toggleLabel} aria-label={toggleLabel} aria-expanded={!collapsed}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            {isMobile ? <X className="size-5" aria-hidden="true" /> : collapsed ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <PanelLeftClose className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {roleNavGroups[role].map((group) => (
          <SidebarGroup key={group.label} className="px-0 py-1">
            <SidebarGroupLabel className="px-3 text-xs font-medium text-sidebar-foreground/75 group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={`${group.label}-${item.href}-${item.label}`}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={`${item.label}${item.description ? ` · ${item.description}` : ''}`}
                      render={<Link href={item.href} aria-label={item.label} aria-current={active ? 'page' : undefined} onClick={() => setOpenMobile(false)} />}
                      className="h-11 cursor-pointer gap-3 rounded-lg px-3 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-primary group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! [&>svg]:size-5"
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

    </Sidebar>
  );
}
