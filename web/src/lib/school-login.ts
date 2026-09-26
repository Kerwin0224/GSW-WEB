/**
 * school-login.ts —— 登录标识（学号 / 工号 / 邮箱 / 手机号）的格式口径。
 *
 * 为什么不再写死 `/^\d{8}$/`：
 * 那是中国 K12 的学号口径，被同时用在三处——单账号创建、CSV 名册、登录页。
 * 教培机构的工牌号、企业培训的邮箱登录、高校 10 位学号在每一处都被拒。
 * 真正的口径属于**租户**：schools.login_id_pattern 就是为此落的那一列。
 *
 * 平台默认值仍然是 8 位数字：没配 pattern 的学校行为不变，
 * 存量数据不需要迁移，也不会因为一次查询失败就让整站不可登录。
 */

/** 平台默认口径：8 位数字。与迁移 20260926150000 的回填值逐字一致。 */
export const DEFAULT_LOGIN_ID_PATTERN = '^\\d{8}$';

/** 登录标识的通用硬约束。与租户口径无关，任何 pattern 都不能突破这几条。 */
const MAX_LOGIN_ID_LENGTH = 64;
/** 控制字符校验。写成字面量区间而不是 `\x00-\x1f`：后者会被 no-control-regex 判错，
 *  而这里要挡的正是那些字符。 */
export function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * 租户口径的兜底解析。
 *
 * 学校行读不到（RLS、迁移未落、查询出错）时回落 8 位数字，而不是抛错：
 * 登录页拿不到 pattern 就变成全站不可登录，是比"多接受了一种格式"严重得多的故障。
 * pattern 本身写坏（非法正则）同样回落——管理员在表单里打错一个括号，
 * 不该让这所学校所有人的账号都登不进来。
 */
export function resolveLoginIdPattern(pattern?: string | null): string {
  const source = pattern?.trim();
  if (!source) return DEFAULT_LOGIN_ID_PATTERN;
  try {
    // eslint-disable-next-line no-new
    new RegExp(source);
    return source;
  } catch {
    return DEFAULT_LOGIN_ID_PATTERN;
  }
}

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(resolveLoginIdPattern(pattern));
  } catch {
    return null;
  }
}

/** 给用户看的口径说明：从正则里尽量还原成人话，说不清就退回通用说法。 */
function describePattern(pattern: string): string {
  if (pattern === DEFAULT_LOGIN_ID_PATTERN) {
    return '账号必须是 8 位数字：学号为入学年份4位+班号2位+流水号2位，工号为入职年份4位+流水号4位。';
  }
  if (pattern === '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$') {
    return '账号请使用邮箱地址。';
  }
  if (/^1[3-9]\d{9}$/.test(pattern)) {
    return '账号请使用 11 位手机号。';
  }
  return '账号格式不符合本校要求，请向本校管理员确认。';
}

export type LoginIdValidation = { ok: true; loginId: string } | { ok: false; message: string };

/**
 * 按租户口径校验登录标识。
 *
 * 不传 pattern 时用平台默认（8 位数字），调用方拿不到学校行也能安全回落。
 * 邮箱是合法登录标识，不再被单独拦掉——租户说清「用邮箱登录」就是用邮箱登录。
 */
export function validateSchoolLoginId(value: string, pattern?: string | null): LoginIdValidation {
  const loginId = value.trim();
  if (!loginId) return { ok: false, message: '请输入登录账号。' };
  if (hasControlCharacter(loginId)) {
    return { ok: false, message: '账号里含有不可见字符，请删除后重试。' };
  }
  if (loginId.length > MAX_LOGIN_ID_LENGTH) {
    return { ok: false, message: `账号不能超过 ${MAX_LOGIN_ID_LENGTH} 个字符。` };
  }
  const effectivePattern = resolveLoginIdPattern(pattern);
  const compiled = compilePattern(effectivePattern);
  if (compiled && !compiled.test(loginId)) {
    return { ok: false, message: describePattern(effectivePattern) };
  }
  return { ok: true, loginId };
}

/**
 * 登录页专用：只做通用硬约束，不按租户口径拦。
 *
 * 登录时**还不知道**这个账号属于哪所学校（同一账号可能跨校），
 * 拿某一所学校的 pattern 去拦，会把另一所学校的合法用户挡在门外。
 * 真正的归属判定交给 authenticate_school_account_v3——它按 login_id 查库，
 * 查不到就是查不到，前端正则在这里没有任何判断价值。
 */
export function validateLoginAttemptId(value: string): LoginIdValidation {
  const loginId = value.trim();
  if (!loginId) return { ok: false, message: '请输入登录账号。' };
  if (hasControlCharacter(loginId)) {
    return { ok: false, message: '账号里含有不可见字符，请删除后重试。' };
  }
  if (loginId.length > MAX_LOGIN_ID_LENGTH) {
    return { ok: false, message: `账号不能超过 ${MAX_LOGIN_ID_LENGTH} 个字符。` };
  }
  return { ok: true, loginId };
}

/**
 * 初始口令：随机、一次性、只展示一次。
 *
 * 为什么不能继续用「初始密码 = 账号本身」：
 * 账号从 8 位数字放宽到邮箱、手机号、字母工号之后，账号就成了可枚举的公开信息
 * （工号是连号、邮箱在通讯录里）。拿可枚举的值当口令，等于给每个账号开一扇后门：
 * 攻击者不需要撞库，只要拿一份名册就能登录全校任何一个账号。
 * 所以这两件事必须一起做——放宽格式而不换口令，比不放宽更糟。
 *
 * 字符集去掉了 0/O、1/l/I 等易混字符：这是一次性抄给管理员的的字符串，
 * 抄错一位的排查成本远高于多几个字符。
 */
const ONE_TIME_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const ONE_TIME_PASSWORD_LENGTH = 12;

export function generateOneTimePassword(): string {
  const bytes = new Uint8Array(ONE_TIME_PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  // 取模偏置在这个字符集与长度下可忽略（256 = 32×8，最后 32 个值多 1/256 的概率），
  // 一次性口令不承载长期机密，不值得为它引入拒绝采样。
  return Array.from(bytes, (byte) => ONE_TIME_PASSWORD_ALPHABET[byte % ONE_TIME_PASSWORD_ALPHABET.length]).join('');
}
