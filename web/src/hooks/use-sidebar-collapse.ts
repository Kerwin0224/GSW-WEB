/**
 * use-sidebar-collapse.ts
 *
 * 学生提问空间侧边栏折叠状态管理。
 * 使用 localStorage 持久化 + useSyncExternalStore 跨标签页同步。
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'student-chat-sidebar-collapsed';
const CUSTOM_EVENT = 'student-chat-sidebar-collapsed-change';

let memoryFallback = false;

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return memoryFallback;
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(CUSTOM_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(CUSTOM_EVENT, onStoreChange);
  };
}

function write(collapsed: boolean) {
  memoryFallback = collapsed;
  try {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  } catch {
    // localStorage 不可用时，内存快照仍能维持当前标签页交互。
  }
  window.dispatchEvent(new Event(CUSTOM_EVENT));
}

export function useSidebarCollapse() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => write(!collapsed);
  return { collapsed, toggle } as const;
}
