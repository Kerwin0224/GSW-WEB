'use client';

/**
 * use-student-assignment.ts
 *
 * 学生会话"归属"行为的内部接缝：会话该落到哪个项目、
 * 两条到达通路（响应 header / 流内 data part）的汇合、
 * 归档回执（toast + 项目行高亮动效）、路由刷新。
 *
 * StudentChatClient 只消费这个小接口，不再自己解析协议细节。
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';

import type { ProjectSummary, StudentConversationInitial } from '@/lib/data/student';
import { parseAssignmentFromHeaders, type AssignmentHeaderReader, type StudentAssignmentData } from '@/lib/student-chat-contract';

export type AssignmentNotice = { kind: 'project'; title: string } | { kind: 'archive' };

const NOTICE_TTL_MS = 4000;
const ARCHIVE_HIGHLIGHT_TTL_MS = 3500;

export function useStudentAssignment({
  projects,
  conversationId,
  refreshRoute,
  initialProjectId = '',
  isStreamingRef,
}: {
  projects: ProjectSummary[];
  conversationId: string;
  /** 会话归属落定后刷新服务端数据（项目列表/归档列表）。 */
  refreshRoute: (routeConversationId?: string) => void;
  /** 服务端首帧已知的初始项目（URL 参数或载入的会话），避免首帧闪回空白态。 */
  initialProjectId?: string;
  /**
   * 流式进行中时只给回执、不刷新路由：refresh 会让服务端 initialConversation
   * 从无到有、翻转整机 key 导致流中 remount（白屏）。流结束的 onFinish 会补刷。
   */
  isStreamingRef?: RefObject<boolean>;
}) {
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  // 多展开：点击项目行即展开/收起，互不影响；归属落定时自动展开目标项目。
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>(initialProjectId ? [initialProjectId] : []);
  const [assignmentNotice, setAssignmentNotice] = useState<AssignmentNotice | null>(null);
  // 归档动效：会话被归入项目时高亮左侧对应项目行，几秒后自动退场。
  const [justArchivedProjectId, setJustArchivedProjectId] = useState('');

  // buildRequestBody / 排队出列在异步回调里读取当前项目，用 ref 避免闭包过期。
  const activeProjectIdRef = useRef(initialProjectId);
  const activeProjectTitleRef = useRef<string | undefined>(initialProjectId ? projects.find((project) => project.id === initialProjectId)?.title : undefined);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    activeProjectTitleRef.current = projects.find((project) => project.id === activeProjectId)?.title;
  }, [activeProjectId, projects]);

  useEffect(() => {
    if (!assignmentNotice) return;
    const timer = window.setTimeout(() => setAssignmentNotice(null), NOTICE_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [assignmentNotice]);

  useEffect(() => {
    if (!justArchivedProjectId) return;
    const timer = window.setTimeout(() => setJustArchivedProjectId(''), ARCHIVE_HIGHLIGHT_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [justArchivedProjectId]);

  /** 点击项目行：展开/收起该篇目的会话列表（多展开互不影响）。 */
  const toggleExpandedProject = useCallback((projectId: string) => {
    setExpandedProjectIds((current) => (current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]));
  }, []);

  /** 归属落定/进入篇目/载入会话时自动展开目标项目（不收起其他项目）。 */
  const expandProject = useCallback((projectId: string) => {
    if (!projectId) return;
    setExpandedProjectIds((current) => (current.includes(projectId) ? current : [...current, projectId]));
  }, []);

  const acceptAssignment = useCallback((assignment: StudentAssignmentData, routeConversationId = conversationId) => {
    if (assignment.kind === 'project') {
      let nextProjectId = assignment.projectId;
      if (assignment.projectId) {
        setActiveProjectId(assignment.projectId);
        expandProject(assignment.projectId);
      } else {
        // 服务端只给标题（新建项目场景）：按标题在现有项目里对号。
        const matchedProject = projects.find((project) => project.title === assignment.title);
        if (matchedProject) {
          nextProjectId = matchedProject.id;
          setActiveProjectId(matchedProject.id);
          expandProject(matchedProject.id);
        }
      }
      const alreadyInProjectContext = Boolean(nextProjectId) && activeProjectIdRef.current === nextProjectId;
      if (!alreadyInProjectContext) {
        setAssignmentNotice({ kind: 'project', title: assignment.title });
        toast.success(`已归入《${assignment.title}》`, {
          description: '本次提问已进入左侧项目，可随时回看。',
          duration: 5000,
        });
        if (nextProjectId) setJustArchivedProjectId(nextProjectId);
      }
      if (!isStreamingRef?.current) refreshRoute(routeConversationId);
      return;
    }

    setAssignmentNotice({ kind: 'archive' });
    toast('已保存到日常会话归档', {
      description: '没有识别到明确篇目；这条会话会保留在左侧归档里，可回看续问。',
      duration: 5000,
    });
    if (!isStreamingRef?.current) refreshRoute(routeConversationId);
  }, [conversationId, expandProject, isStreamingRef, projects, refreshRoute]);

  /** 通路一：首问即知归属，从 HTTP 响应 header 读取。 */
  const acceptResponseHeaders = useCallback((headers: AssignmentHeaderReader, routeConversationId?: string) => {
    const assignment = parseAssignmentFromHeaders(headers);
    if (assignment) acceptAssignment(assignment, routeConversationId);
  }, [acceptAssignment]);

  /** 通路二：异步篇目识别，从流内 data-student-assignment part 读取。 */
  const acceptAssignmentData = useCallback((data: StudentAssignmentData, routeConversationId?: string) => {
    acceptAssignment(data, routeConversationId);
  }, [acceptAssignment]);

  /** 用户显式进入某个项目（开启该篇目的新会话）。 */
  const enterProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    activeProjectIdRef.current = projectId;
    activeProjectTitleRef.current = projects.find((project) => project.id === projectId)?.title;
    expandProject(projectId);
    setAssignmentNotice(null);
  }, [expandProject, projects]);

  /** 回到全局空白入口。 */
  const resetToBlank = useCallback(() => {
    setActiveProjectId('');
    activeProjectIdRef.current = '';
    activeProjectTitleRef.current = undefined;
    setAssignmentNotice(null);
  }, []);

  /** 服务端会话数据载入/切换时同步归属状态（不触发回执）。 */
  const syncFromConversation = useCallback((conversation: StudentConversationInitial | undefined, initialActiveProjectId?: string, projectsArg: ProjectSummary[] = projects) => {
    const nextProjectId = conversation?.projectId ?? initialActiveProjectId ?? '';
    setActiveProjectId(nextProjectId);
    activeProjectIdRef.current = nextProjectId;
    activeProjectTitleRef.current = nextProjectId ? projectsArg.find((project) => project.id === nextProjectId)?.title : undefined;
    expandProject(nextProjectId);
    setAssignmentNotice(null);
  }, [expandProject, projects]);

  return {
    activeProjectId,
    activeProjectIdRef,
    activeProjectTitleRef,
    expandedProjectIds,
    assignmentNotice,
    justArchivedProjectId,
    setNotice: setAssignmentNotice,
    acceptResponseHeaders,
    acceptAssignmentData,
    enterProject,
    toggleExpandedProject,
    resetToBlank,
    syncFromConversation,
  } as const;
}
