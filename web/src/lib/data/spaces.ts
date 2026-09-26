'use server';

/**
 * spaces.ts —— 空间的读写面。
 *
 * 空间属于**老师**：老师建空间、写主题、通过班批量拉学生，也可以从自己任教的班级学生中单独加入；学生切换自己被拉进去的空间。
 *
 * 班级成员仍由 space_classes 派生（一行 = 该班全部学生都在内），直接成员由 space_members
 * 单独记录。两类成员都经过 RLS 和空间所属校验；移出只影响空间可见性，不删除学习数据。
 *
 * 写入口包括：create_space RPC（建空间 + 写主题/科目/颜色 + 首次拉班）、space_classes
 * 班级增删、space_members 学生增删。全部是 security invoker，RLS 是唯一租户闸门。
 */

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { SpaceColorKey, SpaceKind } from '@/lib/supabase/database.types';
import { SPACE_COLOR_KEYS } from '@/lib/space-colors';
import { fail, ok, requireRole, type ActionState, type DataResult } from './common';


export type SpaceClassSummary = { classId: string; className: string; studentCount: number };
export type SpaceStudentSummary = { id: string; displayName: string; loginId: string | null; className?: string | null };
export type SpaceStudentOption = { id: string; displayName: string; loginId: string | null; className: string };

/**
 * 空间里的另一位教师。
 *
 * 与「带的学生」分开建模：协作权和带学生是两件事。
 * 一位同事可能只帮着看学情、不带任何学生；也可能带自己的班但只对这个空间
 * 有查看权。把两者塞进同一张成员表，界面上就会出现「这个空间有 0 名学生、
 * 3 位教师」这种读不懂的列表。
 */
export type SpaceCollaboratorSummary = {
  profileId: string;
  displayName: string;
  loginId: string | null;
  /** owner = 空间所有者（可增删协作者）；co_teacher = 共同教师。 */
  role: 'owner' | 'co_teacher';
  /** 该协作者自己的学校名。跨校空间下这一列才看得出「谁是外校的」。 */
  schoolName: string | null;
};

export type TeacherSpace = {
  id: string;
  name: string;
  theme: string;
  subject: string | null;
  colorKey: SpaceColorKey;
  kind: SpaceKind;
  classes: SpaceClassSummary[];
  directStudents: SpaceStudentSummary[];
  studentCount: number;
  collaborators: SpaceCollaboratorSummary[];
  /** 我是 owner（可管理协作者）还是共同教师（只读协作）。 */
  myRole: 'owner' | 'co_teacher';
  /** 公司级 / 跨校空间没有单一学校归属，界面上要标出来，否则教师会以为配错了。 */
  schoolId: string | null;
  schoolName: string | null;
};

/** 学生视角：空间名称、科目和颜色都足够渲染切换器。 */
export type StudentSpace = { id: string; name: string; subject: string | null; colorKey: SpaceColorKey; kind: SpaceKind };

function revalidateSpaceSurfaces() {
  revalidatePath('/teacher');
  revalidatePath('/student');
}

/**
 * 我能进入的活跃空间：**我建的 ∪ 我被加进去的**。
 *
 * 此前只按 owner_id 取，两位老师共带一班时各建各的空间，
 * 学生端就会并排出现两个同名空间，谁也不知道哪个才是正在用的那个。
 * 作用域统一走 teacher_space_ids()（owner ∪ 协作者），教师端不再逐处自己拼条件。
 */
export async function listTeacherSpaces(): Promise<DataResult<TeacherSpace[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();

  // 先问作用域再取行：「哪些空间是我的」一次 RPC 就够（owner ∪ 协作者），
  // 不必把 owner 与协作者两套条件在应用层拼一遍。
  const { data: scopeIds, error: scopeError } = await supabase.rpc('teacher_space_ids');
  if (scopeError) return fail('error', `空间作用域加载失败：${scopeError.message}`);
  const accessibleIds = ((scopeIds ?? []) as string[]).filter((id) => typeof id === 'string' && id.length > 0);
  if (accessibleIds.length === 0) return ok([]);

  const { data: spaces, error } = await supabase
    .from('spaces')
    .select('id,name,theme,subject,color_key,space_kind,owner_id,school_id,schools(name),space_classes(class_id,classes(name)),space_members(student_id),space_collaborators(profile_id,role,profiles(id,display_name,login_id,school_id,schools(name)))')
    .in('id', accessibleIds)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return fail('error', `空间加载失败：${error.message}`);

  type CollabProfile = { id: string; display_name: string; login_id: string | null; school_id: string | null; schools: { name: string | null } | Array<{ name: string | null }> | null };
  type Row = {
    id: string;
    name: string;
    theme: string;
    subject: string | null;
    color_key: SpaceColorKey;
    space_kind: SpaceKind;
    owner_id: string;
    school_id: string | null;
    schools: { name: string | null } | Array<{ name: string | null }> | null;
    space_classes: Array<{ class_id: string; classes: { name: string | null } | Array<{ name: string | null }> | null }> | null;
    space_members: Array<{ student_id: string }> | null;
    space_collaborators: Array<{ profile_id: string; role: 'owner' | 'co_teacher'; profiles: CollabProfile | Array<CollabProfile> | null }> | null;
  };
  const rows = (spaces ?? []) as unknown as Row[];
  const classIds = Array.from(new Set(rows.flatMap((row) => (row.space_classes ?? []).map((edge) => edge.class_id))));
  const directStudentIds = Array.from(new Set(rows.flatMap((row) => (row.space_members ?? []).map((member) => member.student_id))));

  const studentCountByClass = new Map<string, number>();
  const classStudentIdsByClass = new Map<string, string[]>();
  if (classIds.length > 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from('class_memberships')
      .select('class_id,profile_id')
      .in('class_id', classIds)
      .eq('role', 'student');
    if (membershipError) return fail('error', `班级学生数加载失败：${membershipError.message}`);
    for (const membership of (memberships ?? []) as Array<{ class_id: string; profile_id: string }>) {
      studentCountByClass.set(membership.class_id, (studentCountByClass.get(membership.class_id) ?? 0) + 1);
      const ids = classStudentIdsByClass.get(membership.class_id) ?? [];
      ids.push(membership.profile_id);
      classStudentIdsByClass.set(membership.class_id, ids);
    }
  }

  const profileById = new Map<string, { display_name: string; login_id: string | null }>();
  if (directStudentIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id,display_name,login_id')
      .in('id', directStudentIds);
    if (profileError) return fail('error', `空间学生资料加载失败：${profileError.message}`);
    for (const profile of (profiles ?? []) as Array<{ id: string; display_name: string; login_id: string | null }>) {
      profileById.set(profile.id, { display_name: profile.display_name, login_id: profile.login_id });
    }
  }

  return ok(rows.map((row) => {
    const classes = (row.space_classes ?? []).map((edge) => {
      const klass = Array.isArray(edge.classes) ? edge.classes[0] : edge.classes;
      return {
        classId: edge.class_id,
        className: klass?.name?.trim() || '未命名班级',
        studentCount: studentCountByClass.get(edge.class_id) ?? 0,
      };
    });
    const derivedStudentIds = new Set((row.space_classes ?? []).flatMap((edge) => classStudentIdsByClass.get(edge.class_id) ?? []));
    const directStudents = (row.space_members ?? []).flatMap((member) => {
      const profile = profileById.get(member.student_id);
      return profile ? [{ id: member.student_id, displayName: profile.display_name, loginId: profile.login_id }] : [];
    });
    const extraDirectStudents = directStudents.filter((student) => !derivedStudentIds.has(student.id));
    // 协作边读不到时不能把空间整个判为不可用：RLS 没放行协作者档案
    // 只意味着「看不到他的姓名」，不意味着这个空间出了故障。
    // 退化后仍按 owner_id 判定角色，owner 一定看得到自己。
    const collaborators: SpaceCollaboratorSummary[] = (row.space_collaborators ?? []).flatMap((edge) => {
      const profile = Array.isArray(edge.profiles) ? edge.profiles[0] : edge.profiles;
      const school = profile ? (Array.isArray(profile.schools) ? profile.schools[0] : profile.schools) : null;
      if (!profile) return [];
      return [{
        profileId: edge.profile_id,
        displayName: profile.display_name,
        loginId: profile.login_id,
        role: edge.role,
        schoolName: school?.name?.trim() || null,
      }];
    });
    const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;
    return {
      id: row.id,
      name: row.name,
      theme: row.theme,
      subject: row.subject,
      colorKey: row.color_key,
      kind: row.space_kind,
      classes,
      directStudents,
      studentCount: classes.reduce((sum, klass) => sum + klass.studentCount, 0) + extraDirectStudents.length,
      collaborators,
      myRole: row.owner_id === role.data.id ? 'owner' : 'co_teacher',
      schoolId: row.school_id,
      schoolName: school?.name?.trim() || null,
    };
  }));
}

/** 教师任教班级里的学生，作为空间直接成员的可选名册。 */
export async function listTeacherStudentOptions(): Promise<DataResult<SpaceStudentOption[]>> {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: teacherClasses, error: classError } = await supabase
    .from('class_memberships')
    .select('class_id,classes(name)')
    .eq('profile_id', role.data.id)
    .eq('role', 'teacher');
  if (classError) return fail('error', `任教班级加载失败：${classError.message}`);
  const classRows = (teacherClasses ?? []) as Array<{ class_id: string; classes: { name: string | null } | Array<{ name: string | null }> | null }>;
  if (classRows.length === 0) return ok([]);

  const classNameById = new Map(classRows.map((row) => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes;
    return [row.class_id, klass?.name?.trim() || '未命名班级'] as const;
  }));
  const { data: memberships, error: studentError } = await supabase
    .from('class_memberships')
    .select('class_id,profile_id,profiles!inner(id,display_name,login_id,status)')
    .in('class_id', classRows.map((row) => row.class_id))
    .eq('role', 'student');
  if (studentError) return fail('error', `学生名册加载失败：${studentError.message}`);

  const options = new Map<string, SpaceStudentOption>();
  for (const row of (memberships ?? []) as Array<{
    class_id: string;
    profile_id: string;
    profiles: { id: string; display_name: string; login_id: string | null; status: string } | Array<{ id: string; display_name: string; login_id: string | null; status: string }> | null;
  }>) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    if (!profile || profile.status !== 'active') continue;
    const existing = options.get(profile.id);
    const className = classNameById.get(row.class_id) ?? '未命名班级';
    if (existing) existing.className = Array.from(new Set([...existing.className.split('、'), className])).join('、');
    else options.set(profile.id, { id: profile.id, displayName: profile.display_name, loginId: profile.login_id, className });
  }
  return ok(Array.from(options.values()));
}

/**
 * 学生视角：我被拉进去的空间。
 *
 * 按 space_id 去重。学生可能同时是某个空间的直接成员和某个班的派生成员，
 * 两位老师共带一班时这两条边会同时命中同一个空间；不去重的话
 * 切换器里会出现两个一模一样的条目，学生点哪个都像点错了。
 * 去重键是 id 而不是名称：两个不同空间可以合法地重名（不同科目、不同老师各建一个），
 * 按名称去重会把它们真的合成一个，那才是数据丢失。
 */
export async function listStudentSpaces(): Promise<DataResult<StudentSpace[]>> {
  const role = await requireRole('student');
  if (!role.ok) return role;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('spaces')
    .select('id,name,subject,color_key,space_kind')
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) return fail('error', `空间加载失败：${error.message}`);

  const byId = new Map<string, StudentSpace>();
  for (const space of (data ?? []) as Array<{ id: string; name: string; subject: string | null; color_key: SpaceColorKey; space_kind: SpaceKind }>) {
    if (byId.has(space.id)) continue;
    byId.set(space.id, { id: space.id, name: space.name, subject: space.subject, colorKey: space.color_key, kind: space.space_kind });
  }
  return ok([...byId.values()]);
}

/**
 * 建空间或改已有空间。科目和颜色属于空间，归类规则仍由 theme 单独表达。
 */
export async function saveSpaceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const theme = String(formData.get('theme') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  const colorKey = String(formData.get('color_key') ?? 'pine').trim();
  const spaceKind = String(formData.get('space_kind') ?? 'term').trim() as SpaceKind;
  const classId = String(formData.get('class_id') ?? '').trim();
  if (!name) return { ok: false, message: '请填写空间名称。', errors: { name: '空间名称不能为空。' } };
  if (!subject) return { ok: false, message: '请填写空间科目。', errors: { subject: '空间科目不能为空。' } };
  if (subject.length > 40) return { ok: false, message: '科目名称不能超过 40 个字符。', errors: { subject: '科目名称过长。' } };
  if (!SPACE_COLOR_KEYS.includes(colorKey as SpaceColorKey)) return { ok: false, message: '请选择有效的空间颜色。' };
  if (spaceKind !== 'term' && spaceKind !== 'topic') return { ok: false, message: '请选择有效的空间类型。' };
  const supabase = await createClient();
  if (spaceId) {
    // 共同教师只读协作，不改空间的名称、归类规则与成员。
    // 此前这里只靠 RLS：协作者能不能 update 一条 spaces 行，取决于
    // can_manage_space(owner_id, school_id)，而那一条恰好只认 owner。
    // 依赖 RLS 隐式兜住是可以的，但报出来的是一句难懂的 row-level security，
    // 所以应用层先把话说清楚。
    const { data: owned } = await supabase.from('spaces').select('owner_id').eq('id', spaceId).maybeSingle();
    if (owned && owned.owner_id !== role.data.id) {
      return { ok: false, message: '你是这个空间的共同教师，可以查看但不能修改。需要改动请联系空间所有者。' };
    }
  }
  if (spaceId) {
    // select 之后 0 行 = RLS 没放行（或已被归档他人删除），不是"已保存"。
    const { data: updated, error } = await supabase.from('spaces').update({ name, theme, subject: subject || null, color_key: colorKey as SpaceColorKey, space_kind: spaceKind }).eq('id', spaceId).select('id');
    if (error) return { ok: false, message: `空间保存失败：${error.message}` };
    if (!updated || updated.length === 0) return { ok: false, message: '空间未保存：该空间不存在或不属于你。' };
    revalidateSpaceSurfaces();
    return { ok: true, message: '空间已保存。' };
  }

  const { data: existing, error: existingError } = await supabase
    .from('spaces')
    .select('id')
    .eq('owner_id', role.data.id)
    .eq('name', name)
    .eq('status', 'active')
    .maybeSingle();
  if (existingError) return { ok: false, message: `空间查重失败：${existingError.message}` };
  if (existing) return { ok: false, message: `已存在同名空间「${name}」。换个名字，或直接编辑它。`, errors: { name: '空间名称重复。' } };

  const { error } = await supabase.rpc('create_space_v3', {
    p_name: name,
    p_theme: theme,
    p_class_id: classId || null,
    p_subject: subject || null,
    p_color_key: colorKey as SpaceColorKey,
    p_space_kind: spaceKind,
  });
  if (error) return { ok: false, message: `空间保存失败：${error.message}` };

  revalidateSpaceSurfaces();
  return { ok: true, message: classId ? '空间已建好，该班学生已进入这个空间。' : '空间已建好。' };
}

/** 直接加入或移出一个学生；班级派生成员仍由 space_classes 管理。 */
export async function setSpaceStudentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const studentId = String(formData.get('student_id') ?? '').trim();
  const intent = String(formData.get('intent') ?? '').trim();
  if (!spaceId || !studentId) return { ok: false, message: '缺少空间或学生。' };
  // 白名单，而不是「只要不是 remove 就当加入」：拼错或被篡改的 intent 会静默走成
  // "加入"分支，于是"移出学生"这个删除动作变成了添加——一个校验缺失换来的越权写入。
  if (intent !== 'add' && intent !== 'remove') return { ok: false, message: '未知的操作类型。' };

  const supabase = await createClient();
  if (intent === 'remove') {
    const { data: removed, error } = await supabase.from('space_members').delete().eq('space_id', spaceId).eq('student_id', studentId).select('id');
    if (error) return { ok: false, message: `移出学生失败：${error.message}` };
    if (!removed || removed.length === 0) return { ok: false, message: '该学生本来就不在这个空间里。' };
    revalidateSpaceSurfaces();
    return { ok: true, message: '已移出该学生。' };
  }

  // 幂等加入（ON CONFLICT DO NOTHING）+ 查行数：重复加入不是错误，
  // 但要能区分"加进来了"和"本来就在"。
  const { data: added, error } = await supabase
    .from('space_members')
    .upsert({ space_id: spaceId, student_id: studentId, created_by: role.data.id }, { onConflict: 'space_id,student_id', ignoreDuplicates: true })
    .select('id');
  if (error) return { ok: false, message: `加入学生失败：${error.message}` };
  revalidateSpaceSurfaces();
  return { ok: true, message: added && added.length > 0 ? '已加入该学生。' : '该学生已经在这个空间里。' };
}

/**
 * 拉一个班进来 / 把一个班移出去。
 *
 * 移出 = 删掉那条边，该班学生即刻离开空间。**不碰任何学习数据**——他们沉淀的项目与
 * 会话仍在原地，对他们自己和班主任老师可见，只是不再挂在这位老师的空间主题下。
 * 这就是「零同步」的直接好处：没有孤儿要清，因为本来就没有成员行。
 */
export async function setSpaceClassAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  const classId = String(formData.get('class_id') ?? '').trim();
  const intent = String(formData.get('intent') ?? '').trim();
  if (!spaceId || !classId) return { ok: false, message: '缺少空间或班级。' };
  if (intent !== 'add' && intent !== 'remove') return { ok: false, message: '未知的操作类型。' };

  const supabase = await createClient();
  if (intent === 'remove') {
    const { data: removed, error } = await supabase.from('space_classes').delete().eq('space_id', spaceId).eq('class_id', classId).select('space_id');
    if (error) return { ok: false, message: `移出班级失败：${error.message}` };
    if (!removed || removed.length === 0) return { ok: false, message: '该班本来就不在这个空间里。' };
    revalidateSpaceSurfaces();
    return { ok: true, message: '已移出该班，班内学生不再属于这个空间。' };
  }

  const { data: added, error } = await supabase.rpc('pull_class_into_space', {
    p_space_id: spaceId,
    p_class_id: classId,
  });
  if (error) return { ok: false, message: `拉班失败：${error.message}` };
  revalidateSpaceSurfaces();
  // RPC 返回新增边数：0 表示这个班本来就在空间里，不是错误，但值得说清楚。
  return { ok: true, message: added ? '已拉入该班。' : '该班本来就在这个空间里。' };
}

/** 归档空间。不支持硬删除（迁移里没有 delete 策略），归档后学生侧即刻消失、主题立刻不再生效。 */
export async function archiveSpaceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = await requireRole('teacher');
  if (!role.ok) return { ok: false, message: role.message };

  const spaceId = String(formData.get('space_id') ?? '').trim();
  if (!spaceId) return { ok: false, message: '缺少空间。' };

  const supabase = await createClient();
  // 0 行 = 没归档成功。不查行数的话，"归档失败"会被报成"已归档"，学生侧却还在显示。
  const { data: archived, error } = await supabase.from('spaces').update({ status: 'archived' }).eq('id', spaceId).select('id');
  if (error) return { ok: false, message: `归档失败：${error.message}` };
  if (!archived || archived.length === 0) return { ok: false, message: '归档失败：该空间不存在或不属于你。' };

  revalidateSpaceSurfaces();
  return { ok: true, message: '空间已归档，学生侧不再显示。' };
}

/* ── 协作者 ────────────────────────────────────────────────────────────
 *
 * 「带的学生」与「共同教师」是两条独立的边：协作者不自动获得这个空间的学生名单，
 * 学生也不因为多了位老师就多出一份成员关系。两者在界面上分开呈现，
 * 在数据上也分开存——混在一张表里就会出现「这个空间 0 名学生、3 位教师」的列表。
 */

/** 只有空间 owner 能改协作名单。共同教师看得到，但不动手。 */
async function requireSpaceOwner(spaceId: string) {
  const role = await requireRole('teacher');
  if (!role.ok) return role;
  const supabase = await createClient();
  const { data: space, error } = await supabase.from('spaces').select('owner_id,name').eq('id', spaceId).maybeSingle();
  if (error) return fail('error', `空间读取失败：${error.message}`);
  if (!space) return fail('forbidden', '空间不存在，或已被归档。');
  if (space.owner_id !== role.data.id) {
    return fail('forbidden', `只有「${space.name}」的所有者能调整共同教师。`);
  }
  return ok({ profileId: role.data.id, supabase });
}

/** 可加为共同教师的同事：同公司的教师与校管理员，不含学生与本公司之外的人。 */
export async function listCollaboratorCandidates(spaceId: string): Promise<DataResult<Array<{ id: string; displayName: string; loginId: string | null; schoolName: string | null; subject: string | null }>>> {
  const owner = await requireSpaceOwner(spaceId);
  if (!owner.ok) return owner;
 const { supabase } = owner.data;

  // 范围按「同公司」而不是「同学校」：跨校教研空间要能拉外校的老师进来，
  // 本公司之外的人一律不给。
  const { data: me, error: meError } = await supabase.from('profiles').select('organization_id').eq('id', owner.data.profileId).maybeSingle();
  if (meError) return fail('error', `当前账号读取失败：${meError.message}`);
  const organizationId = me?.organization_id ?? null;
  if (!organizationId) return ok([]);

  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,login_id,subject,school_id,schools(name)')
    .eq('organization_id', organizationId)
    .in('role', ['teacher', 'admin'])
    .eq('status', 'active')
    .order('display_name', { ascending: true });
  if (error) return fail('error', `共同教师候选加载失败：${error.message}`);

  const { data: existing } = await supabase.from('space_collaborators').select('profile_id').eq('space_id', spaceId);
  const taken = new Set(((existing ?? []) as Array<{ profile_id: string }>).map((row) => row.profile_id));

  return ok(((data ?? []) as Array<{ id: string; display_name: string; login_id: string | null; subject: string | null; school_id: string | null; schools: { name: string | null } | Array<{ name: string | null }> | null }>)
    .filter((row) => !taken.has(row.id))
    .map((row) => {
      const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;
      return { id: row.id, displayName: row.display_name, loginId: row.login_id, schoolName: school?.name?.trim() || null, subject: row.subject };
    }));
}

export async function addSpaceCollaboratorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const spaceId = String(formData.get('space_id') ?? '').trim();
  const profileId = String(formData.get('profile_id') ?? '').trim();
  if (!spaceId || !profileId) return { ok: false, message: '请选择要添加的同事。' };

  const owner = await requireSpaceOwner(spaceId);
  if (!owner.ok) return { ok: false, message: owner.message };
  const { supabase } = owner.data;

  // 幂等加入 + 查命中行：重复添加不是错误，但要能区分"加进来了"和"本来就在"。
  const { data: added, error } = await supabase
    .from('space_collaborators')
    .upsert({ space_id: spaceId, profile_id: profileId, role: 'co_teacher', created_by: owner.data.profileId }, { onConflict: 'space_id,profile_id', ignoreDuplicates: true })
    .select('space_id');
  if (error) return { ok: false, message: `添加共同教师失败：${error.message}` };

  revalidateSpaceSurfaces();
  revalidatePath('/teacher/collaborators');
  return { ok: true, message: added && added.length > 0 ? '已加入共同教师。' : '这位同事本来就在这个空间里。' };
}

export async function removeSpaceCollaboratorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const spaceId = String(formData.get('space_id') ?? '').trim();
  const profileId = String(formData.get('profile_id') ?? '').trim();
  if (!spaceId || !profileId) return { ok: false, message: '缺少空间或同事。' };

  const owner = await requireSpaceOwner(spaceId);
  if (!owner.ok) return { ok: false, message: owner.message };
  const { supabase } = owner.data;

  // owner 那条协作边不能删：teacher_can_access_space 与 teacher_space_ids 都靠它
  // 让空间所有者看见自己的空间，删掉之后所有者反而第一个看不见它。
  const { data: removed, error } = await supabase
    .from('space_collaborators')
    .delete()
    .eq('space_id', spaceId)
    .eq('profile_id', profileId)
    .eq('role', 'co_teacher')
    .select('space_id');
  if (error) return { ok: false, message: `移出共同教师失败：${error.message}` };
  if (!removed || removed.length === 0) return { ok: false, message: '这条协作关系不存在，或对方是空间所有者（所有者不能被移出）。' };

  revalidateSpaceSurfaces();
  revalidatePath('/teacher/collaborators');
  return { ok: true, message: '已移出共同教师。该同事名下自己建的班级与学习数据不受影响。' };
}
