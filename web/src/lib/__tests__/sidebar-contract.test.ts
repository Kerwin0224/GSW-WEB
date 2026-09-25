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
  assert.match(buttonSource, /flex w-full items-center gap-2/, '菜单按钮必须是全宽 flex 布局');
  assert.match(buttonSource, /overflow-hidden rounded-md p-2/, '菜单按钮必须保留裁切与圆角基础样式');
  assert.match(buttonSource, /data-active:bg-sidebar-accent/, '当前导航项必须有激活态背景');
  assert.match(buttonSource, /\[&>span:last-child\]:truncate/, '折叠/窄侧栏时文本必须截断');
});
