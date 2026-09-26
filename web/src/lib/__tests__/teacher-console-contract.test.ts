import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

// 教师端面板同样没有组件测试设施（仓库只有 node:test + 纯函数/源码契约两种）。
// 这里钉住的是「操作成功了但界面假装没变」这一类会静默坏掉的契约——
// 它们不会抛异常，只会让教师误判系统状态。
// 断言的是代码不是注释：读进来先剥掉注释，免得解释性文字里提到某个写法就把断言喂饱
// （与 shell-layout-contract.test.ts 同一套做法）。
const read = (rel: string) => readFileSync(resolve(new URL('..', import.meta.url).pathname, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const spacePanel = read('../components/workbench/space-panel.tsx');
const teacherChat = read('../components/workbench/teacher-chat-client.tsx');
const loginPage = read('../app/login/page.tsx');

test('空间面板不得静默回退到别的空间', () => {
  // 归档后 `?? spaces[0]` 会把编辑器悄悄换成另一个空间：教师看着编辑区毫无变化，
  // 以为归档没生效，于是再点一次归档。
  assert.doesNotMatch(spacePanel, /\?\? spaces\[0\]/, '选中空间消失时必须落空态，而不是回退到第一个');
  assert.match(spacePanel, /const current = spaces\.find\(\(space\) => space\.id === selectedId\)/, '当前空间应按选中 id 解析');
  assert.match(spacePanel, /当前没有选中的空间/, '必须给出明确的空态与恢复入口');
  assert.match(spacePanel, /onArchived=\{handleArchived\}/, '归档成功后要清掉选中态');
});

test('归档是不可逆操作，必须先确认并说清影响面', () => {
  const archive = spacePanel.slice(spacePanel.indexOf('function ArchiveButton'));

  assert.match(archive, /<Dialog open=\{confirmOpen\}/, '归档必须走确认弹窗');
  assert.match(archive, /可见学生/, '确认弹窗要给出学生数');
  assert.match(archive, /已拉入班级/, '确认弹窗要给出班级数');
  // 项目数数据层没有返回，不能编；改成把「不会丢什么」讲清楚。
  assert.match(archive, /项目、会话与挑战数据不会被删除/, '要说明项目与会话不会被删除');
  assert.match(archive, /disabled=\{pending\}/, '归档中必须禁用按钮，防重复提交');
});

test('新建空间默认不拉班，且成功后选中新空间', () => {
  // 默认值替教师先拉一个班是不可逆的成员扩张。
  assert.match(spacePanel, /const \[classId, setClassId\] = useState\(''\)/, '新建空间默认「暂不拉班」');
  assert.match(spacePanel, /<option value="">暂不拉班<\/option>/);
  assert.match(spacePanel, /onCreated=\{handleCreated\}/, '创建成功后要把控制权交回面板');
  assert.match(spacePanel, /spaces\.find\(\(space\) => space\.name === pendingSpaceName\)/, '要按名字认领新空间');
});

test('班级派生成员标注来源且不可直接移除', () => {
  assert.match(spacePanel, /!isDerivedStudent\(student\)/, '随班级进入的学生不应再出现在「可以加入」里');
  assert.match(spacePanel, /随班级进入/, '派生成员必须标注来源');
  // 给派生成员一个移除按钮会出现「移出后他仍在空间里」的假失败。
  assert.match(spacePanel, /removableDirectStudents\.map\(/, '可移除列表要排除派生成员');
  assert.doesNotMatch(spacePanel, /derivedDirectStudents\.map\(\(student\) => <StudentChip/, '派生成员不能挂 StudentChip（那会给出移除按钮）');
});

test('备课问答：切会话走 push，生成中禁用切换', () => {
  // 此前对所有 conversationId 都 replaceState，把教师刚点过来的那条历史抹掉了。
  assert.doesNotMatch(teacherChat, /const nextUrl = conversationId \?/, '不应再用全局 replaceState 同步 URL');
  assert.match(teacherChat, /router\.push\('\/teacher\/chat'\)/, '新会话应是一次真实导航，后退键才回得去');
  assert.match(teacherChat, /inert=\{busy \|\| undefined\}/, '生成中必须禁用会话切换（inert 同时断指针与 Tab）');
  assert.match(teacherChat, /正在回答，暂不能切换或删除历史会话/, '禁用要给出可读原因，不能只是点了没反应');
});

test('备课问答历史有搜索与更多入口', () => {
  assert.match(teacherChat, /搜索历史会话/, '历史会话需要搜索入口');
  assert.match(teacherChat, /setShowAllSessions\(true\)/, '需要「更多」展开入口');
});

test('登录页把 ?error= 翻成中文原因', () => {
  // requireProfile 失败会带 ?error= 弹回登录页；不读它教师只知道「又被弹回来了」。
  for (const code of ['role_denied', 'account_disabled', 'profile_required']) {
    assert.match(loginPage, new RegExp(`${code}:\\s*'`), `应给出 ${code} 的中文说明`);
  }
  assert.match(loginPage, /window\.location\.search/, '应从地址栏读取 error 参数');
  assert.match(loginPage, /<AlertDescription>\{shownError\}<\/AlertDescription>/, '原因要渲染出来');
});
