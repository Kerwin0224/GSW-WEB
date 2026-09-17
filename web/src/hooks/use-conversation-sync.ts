/**
 * use-conversation-sync.ts
 *
 * 学生会话实时同步：Supabase Realtime 订阅 + 可见性轮询 + focus 事件。
 * 三种同步机制合一，确保教师修订或会话锁定能及时反映到学生侧。
 */

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

import { getSupabasePublishableKey } from '@/lib/supabase/public-config';

function createBrowserSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = getSupabasePublishableKey();
  if (!supabaseUrl || !publishableKey) {
    throw new Error('Supabase public URL/key are required. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createBrowserClient(supabaseUrl, publishableKey);
}

export function useConversationSync(
  conversationId: string,
  onSync: () => void,
) {
  // focus + visibilitychange + 5 秒轮询：Realtime 不可用或断线时的兜底。
  useEffect(() => {
    if (!conversationId) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') onSync();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
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
      // 只认 broadcast：postgres_changes 需要 Realtime 服务端识别当前用户，
      // 而自定义会话不走 Supabase Auth，RLS 依赖的 current_app_user_id 在那边拿不到
      // （详见 lib/data/student-conversation-broadcast.ts 头注释）。
      .on('broadcast', { event: 'student-conversation-update' }, queueRefresh)
      .subscribe();

    return () => {
      closed = true;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, onSync]);
}
