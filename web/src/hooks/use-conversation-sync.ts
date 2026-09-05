/**
 * use-conversation-sync.ts
 *
 * 学生会话实时同步：Supabase Realtime 订阅 + 可见性轮询 + focus 事件。
 * 三种同步机制合一，确保教师修订或会话锁定能及时反映到学生侧。
 */

import { useEffect } from 'react';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/browser';

export function useConversationSync(
  conversationId: string,
  onSync: () => void,
) {
  // Focus + visibility 事件同步
  useEffect(() => {
    if (!conversationId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') onSync();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [conversationId, onSync]);

  // 定时轮询（5 秒间隔）
  useEffect(() => {
    if (!conversationId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') onSync();
    };
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [conversationId, onSync]);

  // Supabase Realtime 订阅
  useEffect(() => {
    if (!conversationId) return;
    let refreshTimer: number | undefined;
    let closed = false;
    let supabase: ReturnType<typeof createBrowserSupabaseClient>;

    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      return;
    }

    const queueRefresh = () => {
      if (closed) return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(onSync, 150);
    };

    const channel = supabase
      .channel(`student-conversation-sync-${conversationId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'student-conversation-update' }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${conversationId}` }, queueRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_records', filter: `source_conversation_id=eq.${conversationId}` }, queueRefresh)
      .subscribe();

    return () => {
      closed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, onSync]);
}
