/**
 * use-sidebar-collapse.ts
 *
 * 提问空间侧边栏折叠状态管理（学生端 / 教师端共用）。
 * 使用 localStorage 持久化 + useSyncExternalStore 跨标签页同步。
 * 两端各自的折叠状态独立记忆（不同 storageKey），但实现只此一份。
 */

import { useSyncExternalStore } from 'react';

const memoryFallback: Record<string, boolean> = {};

export function useSidebarCollapse(storageKey = 'student-chat-sidebar-collapsed') {
  const customEvent = `${storageKey}-change`;

  const read = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return memoryFallback[storageKey] ?? false;
    }
  };

  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') return () => {};

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) onStoreChange();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(customEvent, onStoreChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(customEvent, onStoreChange);
    };
  };

  const write = (collapsed: boolean) => {
    memoryFallback[storageKey] = collapsed;
    try {
      localStorage.setItem(storageKey, String(collapsed));
    } catch {
      // localStorage 不可用时，内存快照仍能维持当前标签页交互。
    }
    window.dispatchEvent(new Event(customEvent));
  };

  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => write(!collapsed);
  return { collapsed, toggle } as const;
}

