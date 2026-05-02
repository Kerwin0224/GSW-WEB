import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new Uint8Array([
  0xef, 0xe9, 0x0a, 0x5b, 0x14, 0xc8, 0x9a, 0x1b,
  0x31, 0x54, 0xef, 0x36, 0xb1, 0xa7, 0xc4, 0x04,
  0x74, 0x3e, 0xa7, 0x0d, 0x81, 0x91, 0x71, 0x51,
  0x06, 0xb6, 0xf8, 0xef, 0x22, 0xf7, 0x0d, 0x25,
]);

interface JwtPayload {
  sub: string;
  role: string;
}

export async function getUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('cwb_token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
