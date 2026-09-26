import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const sidebarPath = resolve(new URL('.', import.meta.url).pathname, '../../components/ui/sidebar.tsx');
const source = readFileSync(sidebarPath, 'utf8');
const start = source.indexOf('function SidebarMenuButton');
const end = source.indexOf('\n}\n', start);
const buttonSource = source.slice(start, end === -1 ? undefined : end + 2);

test('SidebarMenuButton 保留桌面侧栏所需的基础布局样式', () => {
  assert.notEqual(start, -1, '必须存在 SidebarMenuButton');
  assert.match(buttonSource, /flex [^"]*\bw-full\b[^"]*items-center gap-2/, '菜单按钮必须是全宽 flex 布局');
  assert.match(buttonSource, /overflow-hidden rounded-md p-2/, '菜单按钮必须保留裁切与圆角基础样式');
  assert.match(buttonSource, /data-active:bg-sidebar-accent/, '当前导航项必须有激活态背景');
  assert.match(buttonSource, /\[&>span:last-child\]:truncate/, '折叠/窄侧栏时文本必须截断');
});

test('SidebarMenuButton 折叠态自带居中方形布局', () => {
  assert.match(buttonSource, /group-data-\[collapsible=icon\]:justify-center/, '折叠后必须居中，否则图标偏在文字位置');
  assert.match(buttonSource, /group-data-\[collapsible=icon\]:size-11!/, '折叠后必须是 44px 方块，与展开行等高');
  assert.match(buttonSource, /group-data-\[collapsible=icon\]:p-0!/, '折叠后必须去掉内边距，否则图标被挤偏');
});

test('SidebarMenuButton 键盘焦点可见', () => {
  assert.match(buttonSource, /focus-visible:ring-2/, '键盘导航必须画出焦点环');
  assert.match(buttonSource, /ring-sidebar-ring/, '焦点环要用侧栏专用色，深色侧栏上才看得见');
  assert.match(buttonSource, /outline-hidden/, '自绘 ring 时必须同时压掉原生 outline，避免叠成双环');
});
