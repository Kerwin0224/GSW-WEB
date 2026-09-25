import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';

/**
 * 页面侧的鉴权判定只有 lib/auth.ts 的 requireProfile 一处。三个角色 layout 曾经各自
 * 手抄一遍 `getProfile()` + `if` 链，漏掉 must_change_password 检查的正是那份重复：
 * proxy 只能读 cookie 里的快照，管理员重置密码后旧 cookie 仍是 false，proxy 照常放行。
 * 页面侧每次重新读库，才是真正拦得住的那道墙。
 *
 * 这条不变量没有类型兜底——少一个检查不会编译报错、界面上一路正常，只是账号能进
 * 不该进的页面。所以把它写成可执行断言。
 */

const appDir = resolve(new URL('.', import.meta.url).pathname, '../../app');
const readSrc = (...segments: string[]) => readFileSync(resolve(appDir, ...segments), 'utf8');

/**
 * 去注释后的源码。下面几条断言都是文本匹配，不去注释有两个方向的错：把守卫注释掉
 * （`// await requireProfile('admin')`）照样算通过，而注释里提到 getProfile 又会误报。
 */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const readCode = (...segments: string[]) => stripComments(readSrc(...segments));

/**
 * src/app 下一层里带 layout.tsx 的路由树。
 *
 * 根 layout（src/app/layout.tsx）不含鉴权，不在候选内；/login、/api 这类没有 layout.tsx，
 * 自然被过滤掉。近似之处：若将来新增一个**故意不鉴权**的 layout（比如营销页），
 * 这条会误报——那时应把该路由显式排除，而不是放宽断言。
 */
/** src/app 下所有 .ts/.tsx —— 用来查"谁 import 了逃生口"这种跨模块事实。 */
function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function layouts(): Array<{ route: string; source: string }> {
  return readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ route: entry.name, file: resolve(appDir, entry.name, 'layout.tsx') }))
    .filter(({ file }) => existsSync(file))
    .map(({ route }) => ({ route, source: readCode(route, 'layout.tsx') }));
}

test('每个角色 layout 都走 requireProfile，不得自己 getProfile', () => {
  const found = layouts();
  assert.ok(found.length >= 3, `应至少找到 student / teacher / admin 三个已鉴权 layout，实得 ${found.length}`);

  for (const { route, source } of found) {
    assert.match(source, /await requireProfile\(/, `${route}/layout.tsx 必须用 requireProfile 完成鉴权`);
    assert.doesNotMatch(
      source,
      /getProfile/,
      `${route}/layout.tsx 不得直接 getProfile —— 手抄的判定会漏掉 must_change_password`,
    );
  }
});

/** requireProfile 的强制改密跳转，与 proxy 的跳转必须是同一个 URL，否则用户在两处之间来回弹。 */
test('强制改密的跳转 URL 在 proxy 与页面侧同源', () => {
  const mustChangeUrl = /\/settings\?required=1/;

  assert.match(readSrc('..', 'proxy.ts'), mustChangeUrl, 'proxy 应在 must_change_password 时跳 /settings?required=1');
  assert.match(readSrc('..', 'lib', 'auth.ts'), mustChangeUrl, 'requireProfile 应跳 proxy 用的同一个 URL');
});

/**
 * 改密页必须能用逃生口渲染：如果它自己走 requireProfile，must_change_password 时会
 * 被弹回 /settings，用户永远改不了密码，锁死。
 */
test('逃生口不查 must_change_password，且只有改密页用它', () => {
  const auth = readSrc('..', 'lib', 'auth.ts');
  // slice(indexOf(...)) 在索引为 -1 时切出的是最后一个字符，truthy —— 直接 assert.ok
  // 会让这条断言恒真，连同后面两条 doesNotMatch 一起空转。先显式判缺失，再切函数体。
  const escapeHatchStart = auth.indexOf('export async function requireProfileForPasswordChange');
  assert.notEqual(escapeHatchStart, -1, 'auth.ts 应导出 requireProfileForPasswordChange');
  // 切到该函数自己的收尾大括号为止，不能一直切到文件末尾：否则 auth.ts 后续代码
  // 也被圈进断言范围，后续出现 must_change_password 就会误报。
  const escapeHatchEnd = auth.indexOf('\n}\n', escapeHatchStart);
  const escapeHatch = auth.slice(escapeHatchStart, escapeHatchEnd === -1 ? undefined : escapeHatchEnd + 2);

  assert.match(escapeHatch, /loadProfile\(/, '逃生口应复用同一套角色/状态检查');
  assert.doesNotMatch(escapeHatch, /must_change_password/, '逃生口一旦查 must_change_password 就是死循环');

  // 反向半边：光有逃生口不够，改密页必须真的走它。若有人把 /settings 改回 requireProfile，
  // 该页会把自己重定向到 /settings?required=1，浏览器在同一个 URL 上反复 307 —— 无限重定向，
  // 用户永远改不了密码。这是本文件里唯一"改错了就彻底锁死"的不变量，必须双向断言。
  const settings = readSrc('settings', 'page.tsx');
  assert.match(settings, /await requireProfileForPasswordChange\(/, '/settings 必须用逃生口渲染');
  assert.doesNotMatch(settings, /await requireProfile\(/, '/settings 用 requireProfile 会把自己弹回自己，形成无限重定向');

  // 上一行只证明 /settings 走了逃生口，证明不了"没人抢着用"。逃生口一旦被别的页面
  // 拿去当普通鉴权，那个页面就绕过了强制改密——防护整条失效，且不会有任何报错。
  const strayUsers = sourceFilesUnder(appDir)
    .filter((file) => readFileSync(file, 'utf8').includes('requireProfileForPasswordChange'))
    .map((file) => relative(appDir, file))
    .filter((file) => file !== 'settings/page.tsx');
  assert.deepEqual(strayUsers, [], `逃生口只给 /settings 用，别处用它等于关掉首登改密防护，实得：${strayUsers.join('、')}`);
});

/** 页面级守卫的合法写法：常规入口、改密逃生口、根路由资料分流。 */
const PAGE_GUARD = /await (?:requireProfile|requireProfileForPasswordChange|getProfile)\(/;

/** src/app 下所有 page.tsx。api/* 与 auth/callback 是 route handler，天然不在候选内。 */
const pageFiles = sourceFilesUnder(appDir).filter((file) => basename(file) === 'page.tsx');

/** 公开页白名单，只放行这两棵子树；/auth 下目前只有 callback 这个 route handler。 */
const PUBLIC_TOP_SEGMENTS = new Set(['login', 'auth']);

/** 该目录向上最近的 layout.tsx 绝对路径；一路走到 src/app 仍没有则返回 null。 */
function nearestLayout(dir: string): string | null {
  for (let current = dir; current.startsWith(appDir); current = dirname(current)) {
    const layout = resolve(current, 'layout.tsx');
    if (existsSync(layout)) return layout;
  }
  return null;
}

function routeOf(file: string): string {
  const dir = relative(appDir, dirname(file));
  return dir === '' ? '/' : dir;
}

/**
 * 「有 layout 兜底就够了」只在整页导航时成立：软导航时 layout 不重渲染，而页面会重新渲染。
 *
 * 本规则是这条不变量**弱**的那一半，只覆盖没有已鉴权 layout 祖先的页面（/org 三页、/settings、
 * 根页）。有 layout 祖先的页面在这里一律放行——那批里直读日志的两个由下一条规则单独兜住；
 * 其余 admin/* 与 student/*、teacher/* 页面靠 lib/data/* 内部的 requireRole 短路（页面降级成
 * 错误态，数据漏不出去），所以没有逐个要求。要收紧成「凡页面必自带守卫」，得先把那批补齐。
 */
test('没有已鉴权 layout 祖先的页面必须自带页面级守卫', () => {
  const candidates = pageFiles.filter((file) => !PUBLIC_TOP_SEGMENTS.has(routeOf(file).split(sep)[0]));

  // 反向确认规则没空转：这些页面确实落在候选里，没有被 nearestLayout 误判成"有 layout 兜底"。
  const candidateRoutes = candidates.map(routeOf);
  for (const route of ['/', 'settings', 'org', 'org/platform', 'org/schools/[id]']) {
    assert.ok(candidateRoutes.includes(route), `${route} 应落进候选，实得候选：${candidateRoutes.join('、')}`);
  }

  const unguarded = candidates
    .filter((file) => {
      const layout = nearestLayout(dirname(file));
      if (layout && stripComments(readFileSync(layout, 'utf8')).includes('requireProfile')) return false;
      return !PAGE_GUARD.test(stripComments(readFileSync(file, 'utf8')));
    })
    .map(routeOf);

  assert.deepEqual(
    unguarded,
    [],
    `这些页面没有已鉴权 layout 兜底，必须自己 await requireProfile / requireProfileForPasswordChange / getProfile：${unguarded.join('、')}`,
  );
});

/**
 * 服务端日志读取（readRecentAppEvents / getLogFileStatus）自身没有角色
 * 守卫，不像 lib/data/* 那样内部走 requireRole。admin/logs 的数据路径上再没有别的守卫，软导航
 * 进来时 layout 不重渲染，日志会直接渲染出去——这条规则主要是为它立的。
 *
 * admin/page.tsx 也被这条规则要求（同样 import 了日志读取器），但它实际漏不了：同一批数据里的
 * getAdminDashboard 走 lib/data/*，对 must_change_password 返回失败，页面在那之前就提前返回了。
 * 仍然要求它，是因为「直读日志就自带守卫」比「逐页判断数据路径够不够长」更容易被下一个人守住。
 */
test('直读服务端日志的页面必须自带页面级守卫', () => {
  const logPages = pageFiles.filter((file) => stripComments(readFileSync(file, 'utf8')).includes('@/lib/observability/server-log-store'));
  assert.ok(logPages.length > 0, '应至少有一个页面直读服务端日志，否则本规则空转，检查 import 路径是否变了');

  const unguarded = logPages
    .filter((file) => !PAGE_GUARD.test(stripComments(readFileSync(file, 'utf8'))))
    .map((file) => relative(appDir, file));

  assert.deepEqual(unguarded, [], `直读服务端日志的页面必须自己 await requireProfile：${unguarded.join('、')}`);
});
