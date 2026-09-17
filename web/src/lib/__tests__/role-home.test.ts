import assert from 'node:assert/strict';
import { test } from 'node:test';

// 相对路径带 .ts：npm test 裸跑 node --experimental-strip-types，没有 @/ 别名映射。
import { ROLE_HOME } from '../role-home.ts';
import { APP_ROLES } from '../supabase/database.types.ts';

/**
 * 这张表是 proxy 角色守卫、根页分流、登录页校验、登录 API 重定向四处共用的唯一真源。
 * 穷尽性由 Record<AppRole, string> 兜住（漏一个角色 tsc 报错），但**值**没有任何类型约束：
 * 把 '/admin' 写成 '/student' 照样编译通过，后果是那个角色的用户被 proxy 全量弹回 /login，
 * 而 tsc 与其余测试全绿。所以值这一半只能靠可执行断言钉住。
 */

test('ROLE_HOME 覆盖 APP_ROLES 的每一个角色', () => {
  // 从 APP_ROLES 派生，不重抄角色名——否则这里就成了第三份手抄清单。
  assert.deepEqual(Object.keys(ROLE_HOME).sort(), [...APP_ROLES].sort());
});

test('每个角色的首页是绝对路径，且不与别的角色共用', () => {
  for (const [role, home] of Object.entries(ROLE_HOME)) {
    assert.match(home, /^\/[a-z-]+$/, `${role} 的首页应是形如 /xxx 的绝对路径，实得 ${home}`);
  }
  const homes = Object.values(ROLE_HOME);
  assert.equal(new Set(homes).size, homes.length, `首页路径不得重复，实得 ${homes.join('、')}`);
});

/**
 * proxy 用 Object.entries(ROLE_HOME).find() 取声明顺序里首个前缀命中。若某个角色的首页
 * 同时是更靠前的另一个首页的扩展，它永远匹配不到——那个角色的守卫静默失效，任何持有效
 * cookie 的登录用户都能直达其路径。要求的不是"顺序好看"，而是"没有遮蔽"。
 */
test('没有角色的首页被更靠前的首页前缀遮蔽', () => {
  const entries = Object.entries(ROLE_HOME);
  for (const [index, [role, home]] of entries.entries()) {
    const shadow = entries.slice(0, index).find(([, earlier]) => home.startsWith(earlier));
    assert.equal(
      shadow,
      undefined,
      `${role} 的首页 ${home} 被更靠前的 ${shadow?.[0]}（${shadow?.[1]}）前缀遮蔽，proxy 永远匹配不到它`,
    );
  }
});
