const SCHOOL_ACCOUNT_PATTERN = /^\d{8}$/;

export type SchoolAccountRole = 'admin' | 'teacher' | 'student';

export function normalizeSchoolLoginId(value: string) {
  return value.trim();
}

export function validateSchoolLoginId(value: string) {
  const loginId = normalizeSchoolLoginId(value);
  if (!loginId) return { ok: false as const, message: '请输入学号或工号。' };
  if (loginId.includes('@')) return { ok: false as const, message: '请使用学号或工号登录。' };
  if (!SCHOOL_ACCOUNT_PATTERN.test(loginId)) {
    return { ok: false as const, message: '账号必须是 8 位数字：学号为入学年份4位+班号2位+流水号2位，工号为入职年份4位+流水号4位。' };
  }
  return { ok: true as const, loginId };
}

export function describeSchoolLoginId(loginId: string, role?: SchoolAccountRole) {
  const normalized = normalizeSchoolLoginId(loginId);
  if (!SCHOOL_ACCOUNT_PATTERN.test(normalized)) return null;
  const year = normalized.slice(0, 4);
  if (role === 'student') {
    return { kind: 'student' as const, year, classCode: normalized.slice(4, 6), serial: normalized.slice(6, 8) };
  }
  return { kind: 'staff' as const, year, serial: normalized.slice(4, 8) };
}

export function isInitialPassword(loginId: string, password: string) {
  return normalizeSchoolLoginId(loginId) === password;
}
