import { FileSearch } from 'lucide-react';

import { ChatWorkspace } from '@/components/workbench/chat-workspace';
import { EmptyState } from '@/components/workbench/state-surfaces';
import { AuditQueueNav } from '@/components/workbench/audit/audit-queue-nav';
import { AuditSessionActions, AuditSessionBody, AuditSessionHeader } from '@/components/workbench/audit/audit-session-view';
import { buildAuditHref } from '@/components/workbench/audit/presentation';
import { findNextPendingSessionId } from '@/lib/audit-queue';
import type { AuditSessionDetail, TeacherAuditQueuePage } from '@/lib/data/teacher';

/**
 * 学习记录核实工作区。
 *
 * 外壳复用 ChatWorkspace —— 学生提问空间与教师问答早就统一在它上面，
 * 核实是这个产品里最后一个自建骨架的界面（自己的 grid、没有收起、内边距也不一样），
 * 于是教师端看起来像两套产品。
 *
 * 选中态由 URL 决定（?session=），所以这里是纯服务端渲染：
 * 只有修订表单与动作条是客户端组件，不再把整页数据与交互状态一起发到浏览器。
 */
export function AuditWorkspace({ queue, session, sessionError }: {
  queue: TeacherAuditQueuePage;
  session: AuditSessionDetail | null;
  sessionError?: string;
}) {
  const nextSessionId = session ? findNextPendingSessionId(queue.groups, session.conversationId) : undefined;

  return (
    <ChatWorkspace
      storageKey="teacher-audit-sidebar"
      sidebarLabel="班级、学生、项目与会话导航"
      sidebarWidth="wide"
      mainLabel="完整会话记录"
      sidebar={<AuditQueueNav queue={queue} selectedId={session?.conversationId} />}
      header={session
        ? <AuditSessionHeader session={session} />
        : <h1 className="font-heading text-lg">学习记录核实</h1>}
      messages={session
        ? <AuditSessionBody session={session} />
        : (
          <EmptyState
            title={sessionError ? '这条会话打不开' : '请选择一条会话'}
            description={sessionError ?? '左侧按班级 → 学生 → 项目 → 会话组织；选中后可运行 AI 预审、逐条修订并确认提交整个会话。'}
            action={<FileSearch className="size-5 text-primary" />}
          />
        )}
      footer={session
        ? <AuditSessionActions session={session} nextSessionHref={nextSessionId ? buildAuditHref({ status: queue.status, page: queue.page, session: nextSessionId }) : undefined} />
        : undefined}
    />
  );
}
