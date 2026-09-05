'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen } from 'lucide-react';

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
  const { state, toggleSidebar } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-3 py-4">
        <div className="rounded-[1.4rem] border border-sidebar-border/80 bg-sidebar-accent/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_-30px_rgba(0,0,0,0.85)] group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
            {state === 'collapsed' ? (
              <button
                type="button"
                onClick={toggleSidebar}
                title="展开侧边栏"
                aria-label="展开侧边栏"
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-white/10 transition-transform duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <BookOpen className="size-5" aria-hidden="true" />
              </button>
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm ring-1 ring-white/10">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate font-heading text-xl leading-none tracking-tight">文韵智途</span>
              <p className="mt-1 truncate text-xs text-sidebar-foreground/70">{roleSubtitle[role]}</p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1 pb-2">
        {roleNavGroups[role].map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">{group.label}</SidebarGroupLabel>
            <SidebarMenu className="gap-1">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(`${item.href}/`));
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={`${group.label}-${item.href}-${item.label}`}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={`${item.label}${item.description ? ` · ${item.description}` : ''}`}
                      render={<Link href={item.href} />}
                      className="h-12 cursor-pointer rounded-lg px-3 text-sidebar-foreground/82 transition-[background,color,box-shadow] duration-200 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground data-active:bg-sidebar-primary/16 data-active:text-sidebar-foreground data-active:shadow-[inset_3px_0_0_var(--sidebar-primary),0_12px_30px_-26px_rgba(0,0,0,0.8)] group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:px-2"
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
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
