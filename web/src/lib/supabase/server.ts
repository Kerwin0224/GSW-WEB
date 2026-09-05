import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { createDatabaseSessionSignature, getAppSession } from '@/lib/session';

function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * 强制 supabase-js 的所有 REST 请求走 no-store：
 * postgrest-js 自己没设置 fetch cache option，Next.js App Router 在
 * 静态路由分支里会把 GET 请求塞进 Data Cache；学生/教师页当前通过
 * cookies() 成为 dynamic 所以未踩坑，但一旦未来有人在一个非 dynamic
 * 路径上调 server supabase client，教师修订就会延迟几分钟才到学生侧。
 * 这一行消除那个 foot-gun，与 Supabase ssr 0.10 的 createServerClient
 * 透传 global.fetch 行为对齐。
 */
const fetchNoStore: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });

export async function createClient() {
  const cookieStore = await cookies();
  const session = await getAppSession();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = getSupabasePublishableKey();
  if (!supabaseUrl || !publishableKey) {
    throw new Error('Supabase public URL/key are required. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  return createServerClient(
    supabaseUrl,
    publishableKey,
    {
      global: {
        fetch: fetchNoStore,
        headers: session
          ? {
              'x-cwb-user-id': session.sub,
              'x-cwb-session-signature': createDatabaseSessionSignature(session.sub),
              Authorization: `Bearer ${publishableKey}`,
            }
          : undefined,
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          }),
      },
    },
  );
}
