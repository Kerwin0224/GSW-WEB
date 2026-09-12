/**
 * use-sidebar-scroll.ts
 *
 * 学生提问空间侧边栏滚动位置保持。
 * 切换会话时 page.tsx 的 key 会整机重建 StudentChatClient，
 * 侧边栏随之 remount、scrollTop 归零；这里把滚动位置镜像进
 * sessionStorage，remount 后恢复，消除"点会话回到最顶端"的跳变。
 */

import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'student-chat-sidebar-scroll-top';

export function useSidebarScroll() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let saved = 0;
    try {
      saved = Number(window.sessionStorage.getItem(STORAGE_KEY)) || 0;
    } catch {
      // sessionStorage 不可用（隐私模式等）时静默降级为不恢复。
    }
    if (saved > 0) el.scrollTop = saved;

    const onScroll = () => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, String(el.scrollTop));
      } catch {
        // 同上，只影响下一次恢复。
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return ref;
}
