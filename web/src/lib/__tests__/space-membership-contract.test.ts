import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allMigrationsText, newestFunctionBody, newestPolicy } from './migration-source.ts';

/**
 * 空间成员模型的契约。
 *
 * 这里钉住的每一条，都是**在真 Postgres（docker postgres:16）上跑出来才发现的**，
 * 纯 DDL 自检与 db reset 都抓不到——读 SQL 看起来完全正确：
 *
 *   1. 策略互引造成 infinite recursion（求值期错误，不是语法错误）
 *   2. INSERT ... RETURNING 被 SELECT 策略误拒（快照问题）
 *   3. 策略里的裸子查询受**调用者** RLS 约束 → 比较结果为 NULL 而非 false → 静默拒绝
 *
 * 改这些函数时，本文件会拦住你。改动后请务必重跑那套真库冒烟。
 */

test('空间成员的定义式在 is_my_space 里，是 security definer，且带学校谓词', () => {
  const sql = newestFunctionBody('is_my_space');

  // 非 definer ⇒ 策略里引用它会与 classes / class_memberships 的策略闭合成环。
  // 这是本仓最容易踩的坑：classes_app_member_select 内联查 class_memberships，
  // 而任何在 class_memberships 策略里内联查 classes 的写法都会直接报
  // infinite recursion detected in policy。
  assert.match(sql, /security definer/, 'is_my_space 必须 security definer，否则策略递归');
  assert.match(sql, /c\.school_id is null or c\.school_id = s\.school_id/, '应带学校谓词（NULL 放行，与既有 helper 口径一致）');
  // 这条是「老师调离后空间还在给学生派口径」的唯一防线。
  // 必须相对 s.owner_id 而不是 current_app_user_id()：后者在调用者是学生时恒为 false，
  // 会把全体学生赶出空间。
  assert.match(sql, /mt\.profile_id = s\.owner_id/, '必须校验所有者仍任教该班，且相对 s.owner_id');
  assert.doesNotMatch(sql, /mt\.profile_id = public\.current_app_user_id\(\)/, '不能把所有者校验写成调用者校验');
});

test('spaces_select 用按列形式，insert ... returning 才不会被误拒', () => {
  const sql = newestPolicy('spaces_select');

  // INSERT / UPDATE ... RETURNING（Supabase JS 的 .insert().select() 就是这个形状）
  // 会对新行求值 SELECT 策略。若策略里用 STABLE 函数按 id 回查 spaces 表，
  // 函数用的是语句开始时的快照，看不到正在插入的那行 → 合法插入被判越权。
  assert.match(sql, /can_manage_space_row\(owner_id, school_id\)/, 'spaces_select 必须用按列形式');
  assert.doesNotMatch(sql, /can_manage_space\(id\)(\s|$)/, '不能退回按 id 回查表的形式');

  // 按列形式的规则本体必须与 id 形式同源，否则两处规则会漂移。
  const rowFn = newestFunctionBody('can_manage_space_row');
  assert.match(rowFn, /security definer/);
  const idFn = newestFunctionBody('can_manage_space');
  assert.match(idFn, /can_manage_space_row\(s\.owner_id, s\.school_id\)/, 'id 形式必须是按列形式的包装');
});

test('同校判定是 definer，不依赖调用者对 classes 的可见性', () => {
  const sql = newestFunctionBody('space_class_same_school');

  // 裸子查询写进策略的 WITH CHECK 是以**调用者**身份求值的，会受 classes 自己的 RLS 约束。
  // 调用者看不到该班行 → 空集 → 比较结果是 NULL 而不是 false → 策略静默拒绝。
  assert.match(sql, /security definer/, '同校判定必须 security definer');
  assert.match(sql, /from public\.classes c where c\.id = p_class_id/);

  const policy = newestPolicy('space_classes_manage');
  assert.match(policy, /space_class_same_school\(space_id, class_id\)/, '策略应调用该 helper 而非内联子查询');
  assert.match(policy, /teacher_can_access_class\(class_id\)/, '拉班必须有「我能碰这个班」这一条');
});

test('空间的不变量钉在触发器上：学校不可变、所有者必须是同校教师', () => {
  const sql = newestFunctionBody('validate_space_contract');

  assert.match(sql, /new\.school_id is distinct from old\.school_id/, 'school_id 必须不可变');
  assert.match(sql, /v_role is distinct from 'teacher'/, '所有者必须是教师');
  // 这条挡住「一校管理员把空间转交给二校老师」。RLS 表达不了：
  // 策略里写 can_manage_space(id) 回查表拿到的是**旧行**，转交后学校没变、管理员确实管得着旧行。
  assert.match(sql, /v_school is distinct from new\.school_id/, '所有者必须与空间同校');
});

test('空间只能归档，不存在 delete 策略', () => {
  const text = allMigrationsText();
  assert.doesNotMatch(text, /create policy \w+\s+on public\.spaces for delete/i, 'spaces 不应有 delete 策略');
  // 归档不是硬删：状态列有 archived 这一档，学生侧与主题解析都按 status='active' 收敛。
  assert.match(text, /spaces_status_check check \(status in \('active', 'archived'\)\)/);
  assert.match(newestFunctionBody('is_my_space'), /s\.status = 'active'/, '成员判定必须只认活跃空间');
});

test('判定函数对 anon 开放 execute（RLS 以调用者身份求值）', () => {
  const text = allMigrationsText();

  // 运行角色就是 anon（server.ts 用 publishable key + 基线 GRANT ALL ... TO anon）。
  // 策略里调用的函数若没给 anon EXECUTE，会直接 42501，整张表不可用。
  for (const fn of ['is_my_space(uuid)', 'can_manage_space(uuid)', 'can_manage_space_row(uuid, uuid)', 'space_class_same_school(uuid, uuid)']) {
    assert.match(text, new RegExp(`grant execute on function public\\.${fn.replace(/[()]/g, '\\$&')} to anon, authenticated, service_role`), `${fn} 必须 grant 给 anon`);
  }
  assert.doesNotMatch(text, /revoke all on function public\.(is_my_space|can_manage_space|can_manage_space_row|space_class_same_school)/,
    '绝不能 revoke from anon：那会让策略自己失效');
});

test('空间不拥有学习数据，但学生会话可以绑定空间', () => {
  const text = allMigrationsText();

  assert.doesNotMatch(text, /alter table public\.projects\s+add column[^;]*space_id/i, '项目不复制空间归属');
  assert.match(text, /alter table public\.conversations\s+add column if not exists space_id/i, '会话应保存学生选中的空间');
  assert.match(text, /conversations_validate_space_contract/, '会话空间必须经过可访问性校验');
  assert.match(newestFunctionBody('validate_conversation_space_contract'), /tg_op = 'INSERT'/, '归档或软删已有会话时不应重新校验已失效空间');
  assert.doesNotMatch(text, /alter table public\.conversations\s+add column[^;]*class_id/i, '空间不能替换会话的行政班归属');
  assert.doesNotMatch(text, /drop index if exists public\.class_memberships_one_student_class_idx/);
});

test('空间支持直接学生成员，且成员可见性仍走 is_my_space', () => {
  const text = allMigrationsText();
  assert.match(text, /create table if not exists public\.space_members/);
  assert.match(text, /primary key \(space_id, student_id\)/);
  assert.match(newestPolicy('space_members_manage'), /valid_space_member\(space_id, student_id\)/);
  assert.match(newestFunctionBody('is_my_space'), /from public\.space_members sm/);
  assert.match(newestFunctionBody('valid_space_member'), /p\.role = 'student'/);
});

test('空间科目和颜色是结构化字段，并可由教师自助维护默认科目', () => {
  const text = allMigrationsText();
  assert.match(text, /alter table public\.profiles\s+add column if not exists subject text/);
  assert.match(text, /alter table public\.spaces\s+add column if not exists subject text/);
  assert.match(text, /add column if not exists color_key text not null default 'pine'/);
  assert.match(text, /update_own_subject\(text\)/);
  assert.match(text, /create or replace function public\.create_space_v2\([\s\S]*p_color_key text default 'pine'/);
});

test('建空间与拉班各只有一个写入口', () => {
  const create = newestFunctionBody('create_space');
  assert.match(create, /security invoker/, 'RPC 应是 invoker，RLS 仍是防线');
  assert.match(create, /pull_class_into_space\(v_space_id, p_class_id\)/, '首次拉班复用同一个函数');

  const pull = newestFunctionBody('pull_class_into_space');
  assert.match(pull, /on conflict \(space_id, class_id\) do nothing/, '拉班必须幂等');
});
