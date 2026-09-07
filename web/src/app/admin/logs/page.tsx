import { AdminLogViewer, type AdminLogLoadState } from '@/components/workbench/admin-log-viewer';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { presentLogEvent } from '@/lib/observability/admin-log-presentation';
import { readFilteredAppEvents, type AppEventFilters } from '@/lib/observability/server-log-store';

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const level = pick('level');
  const filters: AppEventFilters = {
    level: level === 'debug' || level === 'info' || level === 'warn' || level === 'error' ? level : undefined,
    traceId: pick('trace_id'),
    userId: pick('user_id'),
    search: pick('q'),
  };
  const loadState: AdminLogLoadState = await readFilteredAppEvents(filters, 120).then(
    (events) => ({ kind: 'loaded', events: events.map(presentLogEvent) }),
    (error) => {
      if (error instanceof Error) {
        return {
          kind: 'error',
          message: '运行记录暂时无法读取。请稍后重试；如持续失败，请联系技术人员检查日志读取链路。',
        };
      }
      throw error;
    },
  );
  const hasLoadedEvents = loadState.kind === 'loaded';
  const events = loadState.kind === 'loaded' ? loadState.events : [];
  const followUpCount = events.filter((event) => event.result === 'failed' || event.result === 'not_completed' || event.result === 'attention').length;
  const completedCount = events.filter((event) => event.result === 'succeeded').length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="运行日志"
        description="查看登录、学习、备课、学校管理与 AI 服务的最近执行记录。页面数字只统计当前筛选返回的样本，不代表系统实时健康。"
        metrics={[
          { label: '当前样本', value: hasLoadedEvents ? events.length : '不可用', hint: hasLoadedEvents ? '服务端筛选后返回，最多 120 条' : '运行记录读取失败' },
          { label: '需要跟进', value: hasLoadedEvents ? followUpCount : '不可用', hint: '失败、未完成或需关注' },
          { label: '明确完成', value: hasLoadedEvents ? completedCount : '不可用', hint: '仅表示对应操作已完成' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="功能执行记录"
          description="先看功能、执行结果、影响对象和处理建议；请求标识与错误上下文只在“技术排查信息”中展示。"
        />
        <AdminLogViewer loadState={loadState} filters={filters} />
      </section>
    </div>
  );
}
