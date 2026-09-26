import { BarChart3 } from 'lucide-react';

import { SectionHeader, WorkspaceHero } from '@/components/workbench/workspace-hero';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireProfile } from '@/lib/auth';
import { readAiUsageDaily, type AiUsageDailyRow } from '@/lib/ai-usage';
import { listTeachingScenarios } from '@/lib/teaching-scenarios';

const USAGE_RANGE_DAYS = 30;

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} k`;
  return String(value);
}

function sum(rows: readonly AiUsageDailyRow[]) {
  return rows.reduce(
    (total, row) => ({
      calls: total.calls + row.calls,
      inputTokens: total.inputTokens + row.inputTokens,
      outputTokens: total.outputTokens + row.outputTokens,
      totalTokens: total.totalTokens + row.totalTokens,
      errors: total.errors + row.errors,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, errors: 0 },
  );
}

export default async function AdminUsagePage() {
  // 页面侧守卫与 /admin 其余页面同款；理由见 /admin/logs 的注释。
  await requireProfile('admin');

  const to = new Date();
  const from = new Date(to.getTime() - USAGE_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const [daily, scenarios] = await Promise.all([
    readAiUsageDaily(from, to).catch(() => [] as AiUsageDailyRow[]),
    listTeachingScenarios({ includeDisabled: true }).catch(() => []),
  ]);

  const totals = sum(daily);
  const bySchool = [...new Map(daily.map((row) => [row.schoolId ?? 'platform', row.schoolName ?? '平台级事件'])).entries()]
    .map(([key, name]) => ({
      key,
      name,
      rows: daily.filter((row) => (row.schoolId ?? 'platform') === key),
    }))
    .sort((left, right) => sum(right.rows).totalTokens - sum(left.rows).totalTokens);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <WorkspaceHero
        title="AI 用量"
        description={`最近 ${USAGE_RANGE_DAYS} 天按学校 × 天统计的模型调用数与 token 消耗。这是「先有计量再谈配额」的第一步：这里只做观测，不做限流。`}
        metrics={[
          { label: '调用次数', value: totals.calls, hint: '成功与失败都计入' },
          { label: '输入 token', value: compact(totals.inputTokens), hint: '提示词侧的消耗' },
          { label: '输出 token', value: compact(totals.outputTokens), hint: '模型回答侧的消耗' },
          { label: '失败调用', value: totals.errors, hint: '带错误码的调用数' },
        ]}
      />

      <section className="space-y-4">
        <SectionHeader
          title="按学校 × 天"
          description="公司管理员会看到本公司全部学校，校管理员只看到本校——范围由数据库读策略决定，这里不再重复过滤。"
        />
        {bySchool.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              这段时间没有记录到 AI 调用。计量从模型解析出口开始统计：如果这段时间真的有人用过 AI，说明埋点没接上。
            </CardContent>
          </Card>
        ) : bySchool.map((school) => {
          const schoolTotals = sum(school.rows);
          return (
            <Card key={school.key}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4" aria-hidden="true" />{school.name}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {schoolTotals.calls} 次调用 · {compact(schoolTotals.totalTokens)} token · {schoolTotals.errors} 次失败
                  </span>
                </div>
                <CardDescription>按天倒序，最近 10 天。</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">日期</th>
                      <th className="py-2 pr-3 font-medium">调用</th>
                      <th className="py-2 pr-3 font-medium">输入 token</th>
                      <th className="py-2 pr-3 font-medium">输出 token</th>
                      <th className="py-2 font-medium">失败</th>
                    </tr>
                  </thead>
                  <tbody>
                    {school.rows.slice(0, 10).map((row) => (
                      <tr key={`${school.key}-${row.day}`} className="border-b last:border-b-0">
                        <td className="py-2 pr-3 font-mono text-xs">{row.day.slice(0, 10)}</td>
                        <td className="py-2 pr-3">{row.calls}</td>
                        <td className="py-2 pr-3">{compact(row.inputTokens)}</td>
                        <td className="py-2 pr-3">{compact(row.outputTokens)}</td>
                        <td className="py-2">{row.errors || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="计量口径"
          description="这些数字是怎么来的，以及它们现在还不能做什么。"
        />
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>计量点是模型解析出口（<code>resolveLanguageModel</code>），学生问答、教师问答、挑战出题与评阅、AI 预审、首问归属与提问类型判断都在其中。</li>
          <li>当前记录的 <code>scenario</code> 是模型能力名；教学场景目录共 {scenarios.length} 个（{scenarios.map((item) => item.displayName).join('、') || '未读取到'}），两者尚未一一对应。</li>
          <li>没有配额、没有限流、没有按学校封顶：计量口径还没跑满一个完整周期，现在设限只会按错误的分母去限。</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          相关页面：<a href="/admin/logs" className="underline underline-offset-4">运行日志</a>（按 event 的慢调用与失败排查）。
        </p>
      </section>
    </div>
  );
}
