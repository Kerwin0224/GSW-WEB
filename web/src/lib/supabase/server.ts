import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { createDatabaseSessionSignature, getAppSession } from '@/lib/session';

function getSupabasePublishableKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

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
