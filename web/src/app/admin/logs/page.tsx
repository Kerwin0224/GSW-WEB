import { AdminLogViewer, type AdminLogLoadState } from '@/components/workbench/admin-log-viewer';
import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { requireProfile } from '@/lib/auth';
import {
  buildAdminLogHref,
  filterPresentedLogExecutions,
  logRangeStartIso,
  LOG_TIME_RANGE_OPTIONS,
  mergePresentedLogExecutions,
  parseAdminLogQuery,
  presentLogEvent,
  summarizeLogExecutions,
} from '@/lib/observability/admin-log-presentation';
import { readRecentAppEvents, type AppEventFilters } from '@/lib/observability/server-log-store';
import { parsePageParam } from '@/lib/pagination';

/** 单次读取的原始事件上限。超出后页面必须说明统计口径，不能把上限说成"全部"。 */
const LOG_SCAN_LIMIT = 300;
const LOG_PAGE_SIZE = 25;

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 页面侧守卫：本页直读服务端日志，是全仓唯一绕过 requireRole 的页面级数据读取。
  // 只靠 /admin/layout 不够——layout 在客户端软导航时不重渲染，待改密管理员从
  // /admin 软跳到本页仍能读到日志。
  await requireProfile('admin');

  const params = await searchParams;
  const query = parseAdminLogQuery(params);
  const rangeLabel = LOG_TIME_RANGE_OPTIONS.find((option) => option.value === query.range)?.label ?? query.range;
  const page = parsePageParam(params.page);
  const storeFilters: AppEventFilters = {
    level: query.level === 'all' ? undefined : query.level,
    traceId: query.traceId || undefined,
    userId: query.userId || undefined,
    search: query.search || undefined,
    since: logRangeStartIso(query.range),
  };

  const loadState: AdminLogLoadState = await readRecentAppEvents(LOG_SCAN_LIMIT, storeFilters).then(
    (result) => {
      // 功能与结果筛选在服务端合并之后判定：同一请求的 started/completed/failed
      // 先合并成一次执行，"待处理"才不会把一次失败算成开始+失败两条。
      const merged = mergePresentedLogExecutions(result.events.map(presentLogEvent));
      const scoped = filterPresentedLogExecutions(merged, query.functionKey, 'all');
      const filtered = filterPresentedLogExecutions(scoped, 'all', query.result);
      const pageCount = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
      return {
        kind: 'loaded' as const,
        query,
        source: result.source,
        summary: summarizeLogExecutions(scoped),
        executions: filtered.slice((Math.min(page, pageCount) - 1) * LOG_PAGE_SIZE, Math.min(page, pageCount) * LOG_PAGE_SIZE),
        total: filtered.length,
        page: Math.min(page, pageCount),
        pageSize: LOG_PAGE_SIZE,
        rawEventCount: result.events.length,
        scanLimit: LOG_SCAN_LIMIT,
      };
    },
    (error) => {
      if (error instanceof Error) {
        return {
          kind: 'error' as const,
          query,
          message: '运行记录暂时无法读取。请稍后重试；如持续失败，请联系技术人员检查日志读取链路。',
        };
      }
      throw error;
    },
  );

  const summary = loadState.kind === 'loaded' ? loadState.summary : null;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="运行日志"
        description={`按功能、执行结果和时间范围排查问题，数字只统计${rangeLabel}内服务端筛选到的记录。`}
        primaryAction={{ label: '查看待处理', href: buildAdminLogHref(query, { result: 'pending', level: 'all' }) }}
        secondaryAction={{ label: '查看失败', href: buildAdminLogHref(query, { result: 'failed', level: 'all' }) }}
        metrics={summary ? [
          { label: '待处理', value: summary.pending, hint: '失败、未完成或需关注的执行次数' },
          { label: '失败', value: summary.failed, hint: '需要复制报告转交开发人员' },
          { label: '警告', value: summary.warning, hint: '系统记录到需关注情况的执行次数' },
          { label: '执行记录', value: summary.executions, hint: summary.lastAt ? `最近一次 ${summary.lastAt}` : `${rangeLabel}内没有匹配记录` },
        ] : [
          { label: '待处理', value: '不可用', hint: '运行记录读取失败' },
          { label: '失败', value: '不可用', hint: '运行记录读取失败' },
          { label: '警告', value: '不可用', hint: '运行记录读取失败' },
          { label: '执行记录', value: '不可用', hint: '运行记录读取失败' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="功能执行记录"
          description="先看功能、执行结果、影响对象和处理建议；点开任意一条可查看生命周期轨迹与可交接的技术报告。"
        />
        <AdminLogViewer loadState={loadState} />
      </section>
    </div>
  );
}
