import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(new URL('..', import.meta.url).pathname);
const RUN_ID = `sft-dpo-e2e-${Date.now()}`;
const PORT = Number(process.env.E2E_PORT ?? 3210);
const DEFAULT_BASE_URL = `http://127.0.0.1:${PORT}`;
let baseUrl = process.env.E2E_BASE_URL ?? DEFAULT_BASE_URL;

const created = {
  auditRecordIds: [],
  messageIds: [],
  conversationIds: [],
  projectIds: [],
  exportBatchIds: [],
};

function loadEnvFile() {
  const path = resolve(WEB_ROOT, '.env.local');
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    if (process.env[key]) continue;
    process.env[key] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required for the real pipeline E2E test.`);
  return value;
}

function databaseSignature(userId) {
  return createHmac('sha256', requiredEnv('CWB_AUTH_SECRET')).update(userId).digest('hex');
}

function createRlsClient(userId) {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key?.trim()) throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.');
  return createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
        'x-cwb-user-id': userId,
        'x-cwb-session-signature': databaseSignature(userId),
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function base64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function createSessionCookie(session) {
  const payload = base64Url(JSON.stringify({
    ...session,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  }));
  const signature = createHmac('sha256', requiredEnv('CWB_AUTH_SECRET')).update(payload).digest('base64url');
  return `cwb_session=${payload}.${signature}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertOk(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function isServerReady(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

function getLockedDevServerUrl() {
  try {
    const lock = JSON.parse(readFileSync(resolve(WEB_ROOT, '.next', 'dev', 'lock'), 'utf8'));
    if (typeof lock.appUrl === 'string' && lock.appUrl.trim()) return lock.appUrl;
    if (lock.hostname && lock.port) return `http://${lock.hostname}:${lock.port}`;
  } catch {
    return null;
  }
  return null;
}

async function waitForServer(processHandle, url) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 60_000) {
    if (processHandle?.exitCode !== null) throw new Error(`Next dev server exited early with code ${processHandle.exitCode}`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await delay(750);
  }
  throw new Error(`Next dev server did not become ready at ${url}: ${lastError?.message ?? 'timeout'}`);
}

async function startServer() {
  if (process.env.E2E_BASE_URL) return null;

  const lockedUrl = getLockedDevServerUrl();
  if (lockedUrl && await isServerReady(lockedUrl)) {
    baseUrl = lockedUrl;
    return null;
  }

  baseUrl = DEFAULT_BASE_URL;
  const child = spawn('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(PORT)], {
    cwd: WEB_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));
  await waitForServer(child, baseUrl);
  return child;
}

async function fetchApp(path, session, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: createSessionCookie(session),
    },
  });
}

async function getSharedClassFixture(admin) {
  const teacherId = process.env.E2E_TEACHER_ID ?? 'a0000000-0000-0000-0000-000000000002';
  const studentId = process.env.E2E_STUDENT_ID ?? 'a0000000-0000-0000-0000-000000000012';
  const classId = process.env.E2E_CLASS_ID ?? 'c0000000-0000-0000-0000-000000000001';

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, login_id, role, display_name, status')
    .in('id', [teacherId, studentId, process.env.E2E_ADMIN_ID ?? 'a0000000-0000-0000-0000-000000000001']);
  if (profileError) throw new Error(`profiles fixture lookup failed: ${profileError.message}`);

  const teacher = profiles.find((profile) => profile.id === teacherId && profile.role === 'teacher');
  const student = profiles.find((profile) => profile.id === studentId && profile.role === 'student');
  const adminProfile = profiles.find((profile) => profile.role === 'admin');
  assert(teacher, `Teacher fixture ${teacherId} not found.`);
  assert(student, `Student fixture ${studentId} not found.`);
  assert(adminProfile, 'Admin fixture not found.');

  const membership = await admin
    .from('class_memberships')
    .select('id')
    .eq('class_id', classId)
    .eq('profile_id', teacherId)
    .eq('role', 'teacher')
    .maybeSingle();
  if (membership.error || !membership.data) throw new Error(`Teacher fixture cannot access class ${classId}.`);

  return { adminProfile, teacher, student, classId };
}

async function seedInteractionTrace({ admin, studentClient, teacher, student, classId, kind }) {
  const projectId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const auditRecordId = crypto.randomUUID();
  const title = `${RUN_ID} ${kind.toUpperCase()} 桃花源记`;
  const prompt = `${RUN_ID} ${kind.toUpperCase()}：请解释“芳草鲜美，落英缤纷”的审美层次。`;
  const answer = `${RUN_ID} ${kind.toUpperCase()} 原始回答：这句话通过视觉意象写出桃花源入口的明丽与静谧。`;

  await assertOk(await studentClient.from('text_projects').insert({
    id: projectId,
    owner_id: student.id,
    class_id: classId,
    title,
    author: '陶渊明',
    text_type: 'prose',
    classification_state: 'classified',
    highest_bloom_level: 4,
  }).select('id').single(), `${kind} project insert`);
  created.projectIds.push(projectId);

  await assertOk(await studentClient.from('conversations').insert({
    id: conversationId,
    owner_id: student.id,
    class_id: classId,
    project_id: projectId,
    source: 'student_chat',
    title: prompt.slice(0, 80),
  }).select('id').single(), `${kind} conversation insert`);
  created.conversationIds.push(conversationId);

  await assertOk(await studentClient.from('conversation_messages').insert([
    {
      id: userMessageId,
      conversation_id: conversationId,
      role: 'user',
      content: prompt,
      parts: [{ type: 'text', text: prompt }],
      bloom_level: 3,
      bloom_state: 'classified',
    },
    {
      id: assistantMessageId,
      conversation_id: conversationId,
      role: 'assistant',
      content: answer,
      parts: [{ type: 'text', text: answer }],
      bloom_level: 4,
      bloom_state: 'classified',
      model_id: 'e2e-real-trace-model',
    },
  ]).select('id'), `${kind} message insert`);
  created.messageIds.push(userMessageId, assistantMessageId);

  await assertOk(await admin.from('audit_records').insert({
    id: auditRecordId,
    source_message_id: assistantMessageId,
    source_conversation_id: conversationId,
    auditor_id: teacher.id,
    class_id: classId,
    kind: 'sft',
    status: 'pending',
    prompt,
    original_answer: answer,
    metadata: { e2e_run_id: RUN_ID, trace_kind: kind, generated_from: 'real_supabase_rls_trace' },
  }).select('id').single(), `${kind} pending audit insert`);
  created.auditRecordIds.push(auditRecordId);

  return { projectId, conversationId, userMessageId, assistantMessageId, auditRecordId, prompt, answer, title };
}

async function expectPageContains(path, session, snippets) {
  const response = await fetchApp(path, session);
  const body = await response.text();
  assert(response.ok, `${path} returned ${response.status}: ${body.slice(0, 300)}`);
  for (const snippet of snippets) {
    assert(body.includes(snippet), `${path} did not render expected text: ${snippet}`);
  }
  return body;
}

async function postJson(path, session, payload) {
  const response = await fetchApp(path, session, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON ${response.status}: ${text.slice(0, 300)}`);
  }
  assert(response.ok, `${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function cleanup(admin) {
  for (const batchId of created.exportBatchIds) {
    await admin.from('export_batches').delete().eq('id', batchId);
  }
  if (created.auditRecordIds.length) await admin.from('audit_records').delete().in('id', created.auditRecordIds);
  if (created.messageIds.length) await admin.from('conversation_messages').delete().in('id', created.messageIds);
  if (created.conversationIds.length) await admin.from('conversations').delete().in('id', created.conversationIds);
  if (created.projectIds.length) await admin.from('text_projects').delete().in('id', created.projectIds);
}

async function main() {
  loadEnvFile();

  const adminId = process.env.E2E_ADMIN_ID ?? 'a0000000-0000-0000-0000-000000000001';
  const admin = createRlsClient(adminId);
  const fixture = await getSharedClassFixture(admin);
  const studentClient = createRlsClient(fixture.student.id);

  const teacherSession = {
    sub: fixture.teacher.id,
    loginId: fixture.teacher.login_id,
    role: 'teacher',
    displayName: fixture.teacher.display_name,
  };
  const adminSession = {
    sub: fixture.adminProfile.id,
    loginId: fixture.adminProfile.login_id,
    role: 'admin',
    displayName: fixture.adminProfile.display_name,
  };

  const server = await startServer();
  try {
    const sftTrace = await seedInteractionTrace({ admin, studentClient, teacher: fixture.teacher, student: fixture.student, classId: fixture.classId, kind: 'sft' });
    const dpoTrace = await seedInteractionTrace({ admin, studentClient, teacher: fixture.teacher, student: fixture.student, classId: fixture.classId, kind: 'dpo' });

    await expectPageContains(`/teacher/audit?message=${sftTrace.assistantMessageId}`, teacherSession, [
      sftTrace.prompt,
      sftTrace.answer,
      sftTrace.title,
      '学习记录核实',
      '确认无误或修订回答',
    ]);

    await postJson('/api/teacher/audit/sft', teacherSession, {
      sourceMessageId: sftTrace.assistantMessageId,
    });

    await postJson('/api/teacher/audit/dpo', teacherSession, {
      sourceMessageId: dpoTrace.assistantMessageId,
      correctedAnswer: `${RUN_ID} DPO 修订回答：先解释意象，再追问学生如何联系全文理想社会。`,
      rationale: '修订版更符合苏格拉底式追问和 Bloom 升阶。',
    });

    const sftTeacherPreview = await postJson('/api/teacher/datasets/preview', teacherSession, { type: 'sft' });
    assert(!('downloadUrl' in sftTeacherPreview), 'Teacher preview must not expose a downloadUrl.');
    assert(JSON.stringify(sftTeacherPreview).includes('messages'), 'Teacher SFT preview must expose chat-style messages.');
    assert(JSON.stringify(sftTeacherPreview).includes(sftTrace.assistantMessageId), 'Teacher SFT preview must preserve source_message_id-derived sample ids.');

    const dpoTeacherPreview = await postJson('/api/teacher/datasets/preview', teacherSession, { type: 'dpo' });
    assert(!('downloadUrl' in dpoTeacherPreview), 'Teacher preview must not expose a downloadUrl.');
    assert(JSON.stringify(dpoTeacherPreview).includes('chosen'), 'Teacher DPO preview must expose chosen/rejected rows.');
    assert(JSON.stringify(dpoTeacherPreview).includes(dpoTrace.assistantMessageId), 'Teacher DPO preview must preserve source_message_id-derived sample ids.');

    const adminSftPreview = await postJson('/api/admin/datasets/export', adminSession, {
      type: 'sft',
      filters: { auditorIds: [fixture.teacher.id] },
      preview: true,
    });
    assert(adminSftPreview.coverage.validRecords >= 1, 'Admin SFT preview should include the approved teacher sample.');
    assert(JSON.stringify(adminSftPreview.sampleRecords).includes('messages'), 'Admin SFT preview should use chat-style messages.');

    const adminDpoPreview = await postJson('/api/admin/datasets/export', adminSession, {
      type: 'dpo',
      filters: { auditorIds: [fixture.teacher.id] },
      preview: true,
    });
    assert(adminDpoPreview.coverage.validRecords >= 1, 'Admin DPO preview should include the approved teacher preference sample.');
    assert(JSON.stringify(adminDpoPreview.sampleRecords).includes('rejected'), 'Admin DPO preview should use prompt/chosen/rejected.');

    const sftExportResult = await postJson('/api/admin/datasets/export', adminSession, {
      type: 'sft',
      filters: { auditorIds: [fixture.teacher.id] },
      preview: false,
    });
    assert(sftExportResult.batchId, 'Admin SFT export must persist an export batch and return batchId.');
    created.exportBatchIds.push(sftExportResult.batchId);
    assert(sftExportResult.downloadUrl, 'Admin SFT export must return a downloadUrl.');

    const sftDownload = await fetchApp(sftExportResult.downloadUrl, adminSession);
    const sftJsonl = await sftDownload.text();
    assert(sftDownload.ok, `SFT download route returned ${sftDownload.status}: ${sftJsonl.slice(0, 300)}`);
    assert(sftJsonl.includes(sftTrace.assistantMessageId) && sftJsonl.includes('sourceRecordId') && sftJsonl.includes('messages'), 'Downloaded SFT JSONL must contain this run traceable chat row.');

    const dpoExportResult = await postJson('/api/admin/datasets/export', adminSession, {
      type: 'dpo',
      filters: { auditorIds: [fixture.teacher.id] },
      preview: false,
    });
    assert(dpoExportResult.batchId, 'Admin DPO export must persist an export batch and return batchId.');
    created.exportBatchIds.push(dpoExportResult.batchId);
    assert(dpoExportResult.downloadUrl, 'Admin DPO export must return a downloadUrl.');

    const dpoDownload = await fetchApp(dpoExportResult.downloadUrl, adminSession);
    const dpoJsonl = await dpoDownload.text();
    assert(dpoDownload.ok, `DPO download route returned ${dpoDownload.status}: ${dpoJsonl.slice(0, 300)}`);
    assert(dpoJsonl.includes(dpoTrace.assistantMessageId) && dpoJsonl.includes('sourceRecordId') && dpoJsonl.includes('prompt') && dpoJsonl.includes('chosen') && dpoJsonl.includes('rejected'), 'Downloaded DPO JSONL must contain this run traceable preference row.');

    const forbiddenTeacherExport = await fetchApp('/api/admin/datasets/export', teacherSession, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'sft', preview: false }),
    });
    assert(forbiddenTeacherExport.status === 403, `Teacher must not export datasets; got ${forbiddenTeacherExport.status}.`);

    console.log(`PASS ${RUN_ID}: real trace -> teacher audit -> teacher preview -> admin export pipeline`);
  } finally {
    await cleanup(admin).catch((error) => console.error(`cleanup failed: ${error.message}`));
    if (server) server.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(`FAIL ${RUN_ID}: ${error.message}`);
  process.exitCode = 1;
});
