const INTERNAL_PHONE_PREFIX = '1999';
const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{2,64}$/;

export function normalizeSchoolLoginId(value: string) {
  return value.trim().toLowerCase();
}

export function validateSchoolLoginId(value: string) {
  const loginId = normalizeSchoolLoginId(value);
  if (!loginId) return { ok: false as const, message: '请输入学号或教职工号。' };
  if (loginId.includes('@')) return { ok: false as const, message: '请使用学号或教职工号登录。' };
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return { ok: false as const, message: '账号只能包含字母、数字、点号、短横线或下划线。' };
  }
  return { ok: true as const, loginId };
}

function fnv1a32(input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function toSupabaseAuthPhone(loginId: string) {
  const normalized = normalizeSchoolLoginId(loginId);
  const hash = String(fnv1a32(normalized)).padStart(10, '0').slice(0, 10);
  return `+${INTERNAL_PHONE_PREFIX}${hash}`;
}
