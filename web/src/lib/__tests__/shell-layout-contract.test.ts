import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const base = resolve(new URL('.', import.meta.url).pathname, '../..');

// 断言的是代码不是注释：读进来先剥掉注释，免得解释性文字里提到某个类名就把断言喂饱。
const read = (rel: string) => readFileSync(resolve(base, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const shell = read('components/app-shell.tsx');
const sidebar = read('components/ui/sidebar.tsx');
const sessionRow = read('components/workbench/session-row.tsx');
const label = read('components/ui/label.tsx');
const globals = read('app/globals.css');
const appError = read('app/error.tsx');
const globalError = read('app/global-error.tsx');

// 页面的高度公式是 calc(100svh - 3.5rem)，3.5rem 就是 header 的 h-14。
// 两侧只要有一边漂移，桌面就会出现底部空白或第二条滚动条。
const HEADER_REM = 3.5;

test('外壳锁死一屏高度，不再用 min-h-svh 撑出空白', () => {
  for (const [name, source] of [['app-shell', shell], ['sidebar', sidebar]] as const) {
    assert.doesNotMatch(source, /min-h-svh/, `${name} 不能再用 min-h-svh：它让长页面把外壳撑高一截`);
  }
  assert.match(shell, /flex h-svh /, 'app-shell 外壳必须是 h-svh');
  assert.match(sidebar, /group\/sidebar-wrapper flex h-svh /, 'sidebar wrapper 必须与外壳同高');
});

test('header 高度与页面高度公式一致，且滚动只发生在 #workspace-main', () => {
  const headerTag = shell.slice(shell.indexOf('<header'), shell.indexOf('>', shell.indexOf('<header')) + 1);
  assert.match(headerTag, /\bh-14\b/, `header 必须是 h-14（= ${HEADER_REM}rem），与页面 calc(100svh - 3.5rem) 对齐`);
  assert.match(headerTag, /shrink-0/, 'header 必须 shrink-0，否则内容一高就被压扁');
  assert.doesNotMatch(headerTag, /sticky/, '外壳已锁高并单点滚动，sticky header 是失效装饰');
  assert.doesNotMatch(headerTag, /backdrop-blur/, '没有内容会滚到 header 底下，磨砂是无谓的绘制开销');
  const scrollContainers = shell.match(/id="workspace-main"[^>]*overflow-y-auto/g) ?? [];
  assert.equal(scrollContainers.length, 2, 'sidebar / top 两条分支的 #workspace-main 都必须自带滚动');
});

test('面包屑走 next/link，不再整页刷新', () => {
  assert.match(shell, /<BreadcrumbLink render=\{<Link href=\{seg\.href\} \/>\}/, '面包屑必须渲染为 next/link');
});

test('会话行删除入口：移动端常驻可见且够触摸面积，桌面端才收窄', () => {
  const button = sessionRow.slice(sessionRow.indexOf('<button'), sessionRow.indexOf('</button>'));
  assert.match(button, /min-h-11/, '移动端删除按钮必须撑到 44px 触摸目标');
  assert.doesNotMatch(button, /^\s*opacity-0/, '触屏没有 hover，常驻 opacity-0 等于没有删除入口');
  assert.match(button, /sm:opacity-0 sm:group-hover\/session:opacity-100/, '桌面端维持 hover/focus 才显形');
  assert.match(button, /aria-label=\{`删除会话 /, '删除按钮必须有可读名称');
  assert.match(button, /title=\{/, '桌面端 hover 需要文字提示');
});

test('全局焦点基线：漏写焦点的控件仍有一圈轮廓，且不与自绘 ring 叠双环', () => {
  assert.match(globals, /:where\(:focus-visible\)\s*\{\s*outline: 2px solid var\(--ring\)/, '必须有零特异性的全局焦点轮廓');
  const reducedMotion = globals.slice(globals.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reducedMotion, /transition-duration: 0\.01ms !important/, 'reduced-motion 必须压掉过渡时长');
  assert.match(reducedMotion, /transition-delay: 0\.01ms !important/, 'reduced-motion 必须同时压掉过渡延迟');
});

test('Label 关联不得对纯文本子节点抛错', () => {
  // <Label>密码</Label> 是全仓最常见的写法。Children.count('密码') === 1 也成立，
  // 再交给 Children.only 会抛 "expected a single React element child" → 整页 500。
  assert.doesNotMatch(label, /Children\.only/, 'Children.only 遇到裸字符串/数字子节点必抛，禁止使用');
  assert.match(label, /isValidElement[\s\S]*?\.props\.id/, '关联判定必须直接看子节点本身');
  assert.match(label, /htmlFor=\{htmlFor \?\? childId\}/, '显式 htmlFor 优先，其次才是子节点 id 回填');
});

test('错误页都给出可恢复动作与返回路径', () => {
  assert.match(appError, /unstable_retry/, 'error.tsx 必须提供重试');
  assert.match(appError, /href="\/"/, 'error.tsx 必须提供返回工作台的路径');
  assert.match(globalError, /unstable_retry/, 'global-error.tsx 必须提供重试');
  assert.match(globalError, /href="\/"/, 'global-error.tsx 必须提供返回工作台的路径');
  assert.match(globalError, /role="alert"/, 'global-error 必须被读屏宣告');
});
