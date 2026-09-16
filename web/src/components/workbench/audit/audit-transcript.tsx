import { CheckCircle2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { MarkdownContent } from '@/components/workbench/markdown-content';
import { AuditAnswerEditor } from '@/components/workbench/audit/audit-answer-editor';
import { assistantStateLabel } from '@/components/workbench/audit/presentation';
import type { TeacherAuditMessage } from '@/lib/data/teacher';
import { cn } from '@/lib/utils';

/**
 * 完整会话：学生提问与 AI 回答逐条渲染。
 *
 * 修订过的回答同时显示「AI 原回答」与「教师修订版」——教师核实时必须看清自己改了什么，
 * 只显示一版会让复核无从下手。标红片段来自 AI 预审，只定位疑点、不代表已判错。
 */
export function AuditTranscript({ transcript, locked, preReviewPartial }: {
  transcript: TeacherAuditMessage[];
  /** 会话已最终提交：修订入口收起为只读说明。 */
  locked: boolean;
  /** 预审只覆盖了一部分回答：未覆盖的气泡要标出来，否则教师以为「没标红 = 没问题」。 */
  preReviewPartial: boolean;
}) {
  return (
    <section className="space-y-4" aria-label="完整会话">
      {transcript.map((item) => {
        const isAssistant = item.role === 'assistant';
        const hasRevision = Boolean(isAssistant && item.revisedContent && item.originalContent);
        const assistantContent = hasRevision ? item.originalContent! : item.content;
        return (
          <article key={item.id} className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
            <div className={cn('max-w-[88%]', isAssistant && 'space-y-2')}>
              <div className={cn('rounded-xl border px-4 py-3 shadow-soft backdrop-blur', isAssistant ? 'bg-card/95' : 'bg-primary text-primary-foreground shadow-ink', isAssistant && item.preReviewIssues.length > 0 && 'border-destructive/55 ring-2 ring-destructive/18')}>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs opacity-85">
                  <Badge variant={isAssistant ? 'outline' : 'secondary'}>{hasRevision ? 'AI 原回答' : isAssistant ? 'AI 回答' : '学生提问'}</Badge>
                  {isAssistant ? <Badge variant={item.reviewState === 'revised' ? 'default' : 'outline'}>{assistantStateLabel(item.reviewState)}</Badge> : null}
                  {isAssistant && item.preReviewIssues.length > 0 ? <Badge variant="destructive">{item.preReviewIssues.length} 处疑点</Badge> : null}
                  {isAssistant && item.preReviewChecked && item.preReviewIssues.length === 0 ? <Badge variant="outline">AI 预审 · 无明显疑点</Badge> : null}
                  {isAssistant && preReviewPartial && !item.preReviewChecked ? <Badge variant="outline">待补充预审</Badge> : null}
                  <span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                </div>
                {isAssistant ? (
                  <>
                    <MarkdownContent content={assistantContent} highlights={item.preReviewIssues} />
                    {hasRevision ? (
                      <div className="mt-3 rounded-lg border border-primary/25 bg-primary/6 p-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-primary">
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          <span className="font-medium">教师修订版</span>
                          <Badge variant="outline">已同步学生侧</Badge>
                        </div>
                        <MarkdownContent content={item.revisedContent!} highlights={item.preReviewIssues} className="text-foreground" />
                      </div>
                    ) : null}
                    {/* key 带上当前答案：修订保存后 router.refresh() 会换掉 prop，
                        但组件 state 不重置，重开编辑器会看到上一版草稿。 */}
                    <AuditAnswerEditor key={`${item.id}-${item.revisedContent ?? item.content}`} messageId={item.id} currentAnswer={item.revisedContent ?? item.content} locked={locked} />
                  </>
                ) : (
                  <p className="whitespace-pre-wrap leading-7">{item.content}</p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
