import { SignJWT } from 'jose';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

const JWT_SECRET = new Uint8Array([
  0xef, 0xe9, 0x0a, 0x5b, 0x14, 0xc8, 0x9a, 0x1b,
  0x31, 0x54, 0xef, 0x36, 0xb1, 0xa7, 0xc4, 0x04,
  0x74, 0x3e, 0xa7, 0x0d, 0x81, 0x91, 0x71, 0x51,
  0x06, 0xb6, 0xf8, 0xef, 0x22, 0xf7, 0x0d, 0x25,
]);

export async function POST(req: Request) {
  const { loginId, password } = await req.json() as { loginId?: string; password?: string };

  if (!loginId || !password) {
    return Response.json({ error: '请输入学号/工号和密码' }, { status: 400 });
  }

  const supabase = await createClient();

  // Use SECURITY DEFINER function to bypass RLS during login
  const { data: profile, error } = await supabase.rpc('authenticate_user', {
    p_login_id: loginId,
  });

  if (error || !profile || profile.length === 0) {
    return Response.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const user = profile[0] as { id: string; role: string; display_name: string; password_hash: string };

  // Verify password
  const { data: verified } = await supabase.rpc('verify_password', {
    input_password: password,
    stored_hash: user.password_hash,
  });

  if (!verified) {
    return Response.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const token = await new SignJWT({
    sub: user.id,
    role: user.role,
    // Store only ASCII-safe values; fetch display name from DB when needed
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set('cwb_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });

  return Response.json({
    role: user.role,
    displayName: user.display_name,
  });
}
