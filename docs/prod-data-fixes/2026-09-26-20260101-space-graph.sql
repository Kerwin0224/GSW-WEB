-- 以 20260101 为主账号，补齐一个学校里的多教师关系图。
-- 规则：每位老师默认一个学期空间；语文老师额外拥有一个古诗文专题空间。
-- 脚本可重复执行，所有写入都围绕现有学校和账号，不删除已有学习数据。

begin;

-- 1. 现有两位老师的科目。
update public.profiles
   set subject = case login_id
     when '20240002' then '语文'
     when '20180001' then '数学'
   end
 where login_id in ('20240002', '20180001');

-- 2. 新增任课老师和账号。密码沿用演示账号 demo1234，首登不强制改密。
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select v.id, v.login_id || '@demo.local',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(), now(), now()
from (values
  ('20150003'::uuid, '20150003'),
  ('20150004'::uuid, '20150004'),
  ('20150005'::uuid, '20150005'),
  ('20150006'::uuid, '20150006'),
  ('20150007'::uuid, '20150007'),
  ('20150008'::uuid, '20150008')
) as v(id, login_id)
where not exists (select 1 from auth.users u where u.id = v.id);

insert into public.profiles (id, login_id, display_name, role, status, password_hash, must_change_password, organization_id, school_id, subject)
select v.id, v.login_id, v.display_name, 'teacher', 'active',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), false,
       o.id, s.id, v.subject
from (values
  ('20150003'::uuid, '20150003', '林知远', '英语'),
  ('20150004'::uuid, '20150004', '周砚青', '物理'),
  ('20150005'::uuid, '20150005', '许清和', '化学'),
  ('20150006'::uuid, '20150006', '苏问渠', '生物'),
  ('20150007'::uuid, '20150007', '程子墨', '历史'),
  ('20150008'::uuid, '20150008', '何叙白', '道德与法治')
) as v(id, login_id, display_name, subject)
join public.schools s on s.name = '主校区'
join public.organizations o on o.id = s.org_id
where not exists (select 1 from public.profiles p where p.id = v.id);

-- 3. 新增班级，每位老师负责一个班。
insert into public.classes (id, name, grade, status, school_id, created_by)
select v.id, v.name, v.grade, 'active', s.id, t.id
from (values
  ('f0000000-0000-4000-8000-000000000103'::uuid, '高一(3)班', '高一', '20150003'),
  ('f0000000-0000-4000-8000-000000000104'::uuid, '高一(4)班', '高一', '20150004'),
  ('f0000000-0000-4000-8000-000000000105'::uuid, '高一(5)班', '高一', '20150005'),
  ('f0000000-0000-4000-8000-000000000106'::uuid, '高一(6)班', '高一', '20150006'),
  ('f0000000-0000-4000-8000-000000000107'::uuid, '高一(7)班', '高一', '20150007'),
  ('f0000000-0000-4000-8000-000000000108'::uuid, '高一(8)班', '高一', '20150008')
) as v(id, name, grade, teacher_login)
join public.schools s on s.name = '主校区'
join public.profiles t on t.login_id = v.teacher_login
where not exists (select 1 from public.classes c where c.id = v.id);

insert into public.class_memberships (class_id, profile_id, role)
select v.class_id, t.id, 'teacher'
from (values
  ('f0000000-0000-4000-8000-000000000103'::uuid, '20150003'),
  ('f0000000-0000-4000-8000-000000000104'::uuid, '20150004'),
  ('f0000000-0000-4000-8000-000000000105'::uuid, '20150005'),
  ('f0000000-0000-4000-8000-000000000106'::uuid, '20150006'),
  ('f0000000-0000-4000-8000-000000000107'::uuid, '20150007'),
  ('f0000000-0000-4000-8000-000000000108'::uuid, '20150008')
) as v(class_id, teacher_login)
join public.profiles t on t.login_id = v.teacher_login
on conflict (class_id, profile_id) do nothing;

-- 4. 新增学生，形成每个新班级的关系骨架。
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select v.id, v.login_id || '@demo.local',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(), now(), now()
from (values
  ('e0000000-0000-4000-8000-000000000101'::uuid, '20261001'),
  ('e0000000-0000-4000-8000-000000000102'::uuid, '20261002'),
  ('e0000000-0000-4000-8000-000000000103'::uuid, '20261003'),
  ('e0000000-0000-4000-8000-000000000104'::uuid, '20261004'),
  ('e0000000-0000-4000-8000-000000000105'::uuid, '20261005'),
  ('e0000000-0000-4000-8000-000000000106'::uuid, '20261006'),
  ('e0000000-0000-4000-8000-000000000107'::uuid, '20261007'),
  ('e0000000-0000-4000-8000-000000000108'::uuid, '20261008'),
  ('e0000000-0000-4000-8000-000000000109'::uuid, '20261009'),
  ('e0000000-0000-4000-8000-000000000110'::uuid, '20261010'),
  ('e0000000-0000-4000-8000-000000000111'::uuid, '20261011'),
  ('e0000000-0000-4000-8000-000000000112'::uuid, '20261012'),
  ('e0000000-0000-4000-8000-000000000113'::uuid, '20261013'),
  ('e0000000-0000-4000-8000-000000000114'::uuid, '20261014'),
  ('e0000000-0000-4000-8000-000000000115'::uuid, '20261015'),
  ('e0000000-0000-4000-8000-000000000116'::uuid, '20261016'),
  ('e0000000-0000-4000-8000-000000000117'::uuid, '20261017'),
  ('e0000000-0000-4000-8000-000000000118'::uuid, '20261018')
) as v(id, login_id)
where not exists (select 1 from auth.users u where u.id = v.id);

insert into public.profiles (id, login_id, display_name, role, status, password_hash, must_change_password, organization_id, school_id)
select v.id, v.login_id, v.display_name, 'student', 'active',
       extensions.crypt('demo1234', extensions.gen_salt('bf')), false, o.id, s.id
from (values
  ('e0000000-0000-4000-8000-000000000101'::uuid, '20261001', '许清越'),
  ('e0000000-0000-4000-8000-000000000102'::uuid, '20261002', '沈知微'),
  ('e0000000-0000-4000-8000-000000000103'::uuid, '20261003', '周予安'),
  ('e0000000-0000-4000-8000-000000000104'::uuid, '20261004', '顾南枝'),
  ('e0000000-0000-4000-8000-000000000105'::uuid, '20261005', '江砚'),
  ('e0000000-0000-4000-8000-000000000106'::uuid, '20261006', '林向晚'),
  ('e0000000-0000-4000-8000-000000000107'::uuid, '20261007', '陆星遥'),
  ('e0000000-0000-4000-8000-000000000108'::uuid, '20261008', '苏禾'),
  ('e0000000-0000-4000-8000-000000000109'::uuid, '20261009', '程澈'),
  ('e0000000-0000-4000-8000-000000000110'::uuid, '20261010', '何听澜'),
  ('e0000000-0000-4000-8000-000000000111'::uuid, '20261011', '沈砚青'),
  ('e0000000-0000-4000-8000-000000000112'::uuid, '20261012', '顾星野'),
  ('e0000000-0000-4000-8000-000000000113'::uuid, '20261013', '许知行'),
  ('e0000000-0000-4000-8000-000000000114'::uuid, '20261014', '林书宁'),
  ('e0000000-0000-4000-8000-000000000115'::uuid, '20261015', '周安禾'),
  ('e0000000-0000-4000-8000-000000000116'::uuid, '20261016', '苏景行'),
  ('e0000000-0000-4000-8000-000000000117'::uuid, '20261017', '陈知夏'),
  ('e0000000-0000-4000-8000-000000000118'::uuid, '20261018', '顾云舟')
) as v(id, login_id, display_name)
join public.schools s on s.name = '主校区'
join public.organizations o on o.id = s.org_id
where not exists (select 1 from public.profiles p where p.id = v.id);

insert into public.class_memberships (class_id, profile_id, role)
select v.class_id, p.id, 'student'
from (values
  ('f0000000-0000-4000-8000-000000000103'::uuid, '20261001'),
  ('f0000000-0000-4000-8000-000000000103'::uuid, '20261002'),
  ('f0000000-0000-4000-8000-000000000103'::uuid, '20261003'),
  ('f0000000-0000-4000-8000-000000000104'::uuid, '20261004'),
  ('f0000000-0000-4000-8000-000000000104'::uuid, '20261005'),
  ('f0000000-0000-4000-8000-000000000104'::uuid, '20261006'),
  ('f0000000-0000-4000-8000-000000000105'::uuid, '20261007'),
  ('f0000000-0000-4000-8000-000000000105'::uuid, '20261008'),
  ('f0000000-0000-4000-8000-000000000105'::uuid, '20261009'),
  ('f0000000-0000-4000-8000-000000000106'::uuid, '20261010'),
  ('f0000000-0000-4000-8000-000000000106'::uuid, '20261011'),
  ('f0000000-0000-4000-8000-000000000106'::uuid, '20261012'),
  ('f0000000-0000-4000-8000-000000000107'::uuid, '20261013'),
  ('f0000000-0000-4000-8000-000000000107'::uuid, '20261014'),
  ('f0000000-0000-4000-8000-000000000107'::uuid, '20261015'),
  ('f0000000-0000-4000-8000-000000000108'::uuid, '20261016'),
  ('f0000000-0000-4000-8000-000000000108'::uuid, '20261017'),
  ('f0000000-0000-4000-8000-000000000108'::uuid, '20261018')
) as v(class_id, login_id)
join public.profiles p on p.login_id = v.login_id
on conflict (class_id, profile_id) do nothing;

-- 5. 空间：每位老师一个学期空间，语文老师额外一个古诗文专题空间。
update public.spaces
   set name = '古诗文·专题空间', space_kind = 'topic'
 where name = '语文·篇目空间';
update public.spaces
   set name = '数学·学期空间', space_kind = 'term'
 where name = '数学·知识点空间';

insert into public.spaces (id, school_id, owner_id, name, theme, subject, color_key, space_kind)
select v.id, s.id, t.id, v.name, v.theme, v.subject, v.color_key, v.space_kind
from (values
  ('a1000000-0000-4000-8000-000000000101'::uuid, '20240002', '语文·学期空间', '本学期语文内容按课文、知识点和阅读材料归类。', '语文', 'pine', 'term'),
  ('a1000000-0000-4000-8000-000000000102'::uuid, '20150003', '英语·学期空间', '英语按话题、语法点和阅读材料归类。', '英语', 'moon', 'term'),
  ('a1000000-0000-4000-8000-000000000103'::uuid, '20150004', '物理·学期空间', '物理按概念、模型和实验现象归类。', '物理', 'ink', 'term'),
  ('a1000000-0000-4000-8000-000000000104'::uuid, '20150005', '化学·学期空间', '化学按物质、反应和实验归类。', '化学', 'bamboo', 'term'),
  ('a1000000-0000-4000-8000-000000000105'::uuid, '20150006', '生物·学期空间', '生物按概念、过程和实验归类。', '生物', 'plum', 'term'),
  ('a1000000-0000-4000-8000-000000000106'::uuid, '20150007', '历史·学期空间', '历史按时间、事件和主题归类。', '历史', 'cinnabar', 'term'),
  ('a1000000-0000-4000-8000-000000000107'::uuid, '20150008', '道法·学期空间', '道法按主题、概念和材料归类。', '道德与法治', 'moon', 'term')
) as v(id, owner_login, name, theme, subject, color_key, space_kind)
join public.profiles t on t.login_id = v.owner_login
join public.schools s on s.name = '主校区'
where not exists (select 1 from public.spaces sp where sp.id = v.id);

-- 6. 空间绑定班级，并把 20260101 作为跨空间演示学生加入所有空间。
insert into public.space_classes (space_id, class_id, created_by)
select sp.id, c.id, sp.owner_id
from public.spaces sp
join public.classes c on c.school_id = sp.school_id
where (sp.name = '语文·学期空间' and c.name = '高一(1)班')
   or (sp.name = '古诗文·专题空间' and c.name = '高一(1)班')
   or (sp.name = '数学·学期空间' and c.name = '高一(2)班')
   or (sp.name = '英语·学期空间' and c.name = '高一(3)班')
   or (sp.name = '物理·学期空间' and c.name = '高一(4)班')
   or (sp.name = '化学·学期空间' and c.name = '高一(5)班')
   or (sp.name = '生物·学期空间' and c.name = '高一(6)班')
   or (sp.name = '历史·学期空间' and c.name = '高一(7)班')
   or (sp.name = '道法·学期空间' and c.name = '高一(8)班')
on conflict (space_id, class_id) do nothing;

insert into public.space_members (space_id, student_id, created_by)
select sp.id, p.id, sp.owner_id
from public.spaces sp
join public.profiles p on p.login_id = '20260101'
where sp.name in ('语文·学期空间', '古诗文·专题空间', '数学·学期空间', '英语·学期空间', '物理·学期空间', '化学·学期空间', '生物·学期空间', '历史·学期空间', '道法·学期空间')
on conflict (space_id, student_id) do nothing;

-- 7. 每个空间给 20260101 一个项目、一个会话和两条消息，形成完整关系链。
insert into public.projects (id, owner_id, class_id, space_id, name, subtitle, classification_state)
select v.id, p.id, c.id, sp.id, v.project_name, v.subtitle, 'classified'
from (values
  ('b1000000-0000-4000-8000-000000000101'::uuid, '语文·学期空间', '现代文阅读', '记叙文阅读'),
  ('b1000000-0000-4000-8000-000000000102'::uuid, '数学·学期空间', '一次函数', '函数与图像'),
  ('b1000000-0000-4000-8000-000000000103'::uuid, '英语·学期空间', '一般现在时', '时态基础'),
  ('b1000000-0000-4000-8000-000000000104'::uuid, '物理·学期空间', '受力分析', '力学基础'),
  ('b1000000-0000-4000-8000-000000000105'::uuid, '化学·学期空间', '物质变化', '实验观察'),
  ('b1000000-0000-4000-8000-000000000106'::uuid, '生物·学期空间', '细胞结构', '概念梳理'),
  ('b1000000-0000-4000-8000-000000000107'::uuid, '历史·学期空间', '时间线', '事件脉络'),
  ('b1000000-0000-4000-8000-000000000108'::uuid, '道法·学期空间', '主题材料', '材料分析'),
  ('b1000000-0000-4000-8000-000000000109'::uuid, '古诗文·专题空间', '古诗文积累', '名篇与名句')
) as v(id, space_name, project_name, subtitle)
join public.profiles p on p.login_id = '20260101'
join public.classes c on c.name = '高一(1)班'
join public.spaces sp on sp.name = v.space_name
where not exists (select 1 from public.projects pr where pr.id = v.id);

insert into public.conversations (id, owner_id, class_id, project_id, space_id, source, title)
select v.id, p.id, c.id, pr.id, pr.space_id, 'student_chat', v.title
from (values
  ('c1000000-0000-4000-8000-000000000101'::uuid, 'b1000000-0000-4000-8000-000000000101', '现代文阅读里的环境描写'),
  ('c1000000-0000-4000-8000-000000000102'::uuid, 'b1000000-0000-4000-8000-000000000102', '一次函数的图像怎么理解'),
  ('c1000000-0000-4000-8000-000000000103'::uuid, 'b1000000-0000-4000-8000-000000000103', '一般现在时的第三人称单数'),
  ('c1000000-0000-4000-8000-000000000104'::uuid, 'b1000000-0000-4000-8000-000000000104', '受力分析先看什么'),
  ('c1000000-0000-4000-8000-000000000105'::uuid, 'b1000000-0000-4000-8000-000000000105', '物质变化实验观察'),
  ('c1000000-0000-4000-8000-000000000106'::uuid, 'b1000000-0000-4000-8000-000000000106', '细胞结构怎么记'),
  ('c1000000-0000-4000-8000-000000000107'::uuid, 'b1000000-0000-4000-8000-000000000107', '历史事件时间线'),
  ('c1000000-0000-4000-8000-000000000108'::uuid, 'b1000000-0000-4000-8000-000000000108', '道法材料题怎么拆'),
  ('c1000000-0000-4000-8000-000000000109'::uuid, 'b1000000-0000-4000-8000-000000000109', '古诗文名句积累')
) as v(id, project_id, title)
join public.profiles p on p.login_id = '20260101'
join public.classes c on c.name = '高一(1)班'
join public.projects pr on pr.id = v.project_id
where not exists (select 1 from public.conversations cv where cv.id = v.id);

insert into public.conversation_messages (id, conversation_id, role, content, parts, bloom_state)
select v.id, v.conversation_id, v.role, v.content,
       jsonb_build_array(jsonb_build_object('type', 'text', 'text', v.content)),
       'unclassified'
from (values
  ('d1000000-0000-4000-8000-000000000101'::uuid, 'c1000000-0000-4000-8000-000000000101'::uuid, 'user', '我想先把阅读题拆成证据和结论。'),
  ('d1000000-0000-4000-8000-000000000102'::uuid, 'c1000000-0000-4000-8000-000000000101'::uuid, 'assistant', '先圈出能直接支持结论的句子，再判断它承担的作用。'),
  ('d1000000-0000-4000-8000-000000000103'::uuid, 'c1000000-0000-4000-8000-000000000102'::uuid, 'user', '一次函数的图像应该从哪里开始看？'),
  ('d1000000-0000-4000-8000-000000000104'::uuid, 'c1000000-0000-4000-8000-000000000102'::uuid, 'assistant', '先看变化趋势，再把关键点代回关系式核对。'),
  ('d1000000-0000-4000-8000-000000000105'::uuid, 'c1000000-0000-4000-8000-000000000103'::uuid, 'user', '第三人称单数总是记不住。'),
  ('d1000000-0000-4000-8000-000000000106'::uuid, 'c1000000-0000-4000-8000-000000000103'::uuid, 'assistant', '先把主语和动词找出来，再按规则加变化。'),
  ('d1000000-0000-4000-8000-000000000107'::uuid, 'c1000000-0000-4000-8000-000000000104'::uuid, 'user', '受力分析第一步应该做什么？'),
  ('d1000000-0000-4000-8000-000000000108'::uuid, 'c1000000-0000-4000-8000-000000000104'::uuid, 'assistant', '先确定研究对象，再画受力图。'),
  ('d1000000-0000-4000-8000-000000000109'::uuid, 'c1000000-0000-4000-8000-000000000105'::uuid, 'user', '物质变化的实验现象从哪里记？'),
  ('d1000000-0000-4000-8000-000000000110'::uuid, 'c1000000-0000-4000-8000-000000000105'::uuid, 'assistant', '把颜色、沉淀、气体和能量变化列成观察表。'),
  ('d1000000-0000-4000-8000-000000000111'::uuid, 'c1000000-0000-4000-8000-000000000106'::uuid, 'user', '细胞结构总是混淆。'),
  ('d1000000-0000-4000-8000-000000000112'::uuid, 'c1000000-0000-4000-8000-000000000106'::uuid, 'assistant', '先按功能分层，再用结构特征做区分。'),
  ('d1000000-0000-4000-8000-000000000113'::uuid, 'c1000000-0000-4000-8000-000000000107'::uuid, 'user', '历史时间线怎么整理？'),
  ('d1000000-0000-4000-8000-000000000114'::uuid, 'c1000000-0000-4000-8000-000000000107'::uuid, 'assistant', '先按时间排序，再给每个事件补原因和影响。'),
  ('d1000000-0000-4000-8000-000000000115'::uuid, 'c1000000-0000-4000-8000-000000000108'::uuid, 'user', '道法材料题不知道怎么拆。'),
  ('d1000000-0000-4000-8000-000000000116'::uuid, 'c1000000-0000-4000-8000-000000000108'::uuid, 'assistant', '先找材料中的行为和结果，再对应到具体知识点。'),
  ('d1000000-0000-4000-8000-000000000117'::uuid, 'c1000000-0000-4000-8000-000000000109'::uuid, 'user', '古诗文名句应该怎么积累？'),
  ('d1000000-0000-4000-8000-000000000118'::uuid, 'c1000000-0000-4000-8000-000000000109'::uuid, 'assistant', '按意象、情感和篇目建立索引，隔天再回想一次。')
) as v(id, conversation_id, role, content)
where not exists (select 1 from public.conversation_messages m where m.id = v.id);

-- 8. 给数学和英语项目各留一条挑战记录，验证挑战链路也能展示。
insert into public.practice_records (id, student_id, project_id, target_bloom_level, prompt, answer, feedback, achieved, evaluation_state)
select v.id, p.id, pr.id, 1, v.prompt, '已完成一次基础练习。', '继续巩固。', true, 'evaluated'
from (values
  ('f1000000-0000-4000-8000-000000000101'::uuid, 'b1000000-0000-4000-8000-000000000102'::uuid, '画出一次函数的基本图像。'),
  ('f1000000-0000-4000-8000-000000000102'::uuid, 'b1000000-0000-4000-8000-000000000103'::uuid, '用一句话说明一般现在时。')
) as v(id, project_id, prompt)
join public.profiles p on p.login_id = '20260101'
join public.projects pr on pr.id = v.project_id
where not exists (select 1 from public.practice_records r where r.id = v.id);

commit;

select
  s.name as space,
  s.space_kind as kind,
  s.subject as subject,
  count(distinct sc.class_id) as class_count,
  count(distinct sm.student_id) as direct_student_count,
  count(distinct pr.id) as project_count,
  count(distinct cv.id) as conversation_count
from public.spaces s
left join public.space_classes sc on sc.space_id = s.id
left join public.space_members sm on sm.space_id = s.id
left join public.projects pr on pr.space_id = s.id
left join public.conversations cv on cv.space_id = s.id and cv.deleted_at is null
where s.name in ('语文·学期空间', '古诗文·专题空间', '数学·学期空间', '英语·学期空间', '物理·学期空间', '化学·学期空间', '生物·学期空间', '历史·学期空间', '道法·学期空间')
  and s.status = 'active'
group by s.id, s.name, s.space_kind, s.subject
order by s.subject, s.space_kind, s.name;
