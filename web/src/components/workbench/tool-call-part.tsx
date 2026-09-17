import { AlertTriangle, CheckCircle2, Globe, Loader2, Wrench } from 'lucide-react';

import { describeToolPart, type ToolCallState } from '@/lib/tool-call-view';
import { cn } from '@/lib/utils';

const STATE_ICON: Record<ToolCallState, typeof Globe> = {
  running: Loader2,
  done: CheckCircle2,
  error: AlertTriangle,
};

/**
 * 工具调用气泡。
 *
 * MCP 工具的类别由名字推断（见 lib/tool-call-view.ts），所以这里只有一个通用外观：
 * 联网搜索、读取网页、其他工具共用同一行，靠图标与文案区分。
 *
 * 放在回答正文上方而不是折叠起来：学生会话里「这个结论是查来的还是编的」是学习判断的一部分，
 * 教师核实同样要看这条依据从哪来。藏进折叠区等于把依据变成装饰。
 */
export function ToolCallPart({ part }: { part: unknown }) {
  const view = describeToolPart(part);
  if (!view) return null;

  const Icon = STATE_ICON[view.state];
  const isSearch = view.actionLabel.includes('联网搜索');
  const KindIcon = isSearch ? Globe : Wrench;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs',
        view.state === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : view.state === 'running'
            ? 'border-primary/25 bg-primary/6 text-primary'
            : 'border-border/60 bg-muted/50 text-muted-foreground',
      )}
      role={view.state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <KindIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-medium">{view.actionLabel}</span>
      {view.detail ? <span className="min-w-0 truncate opacity-80">{isSearch ? `“${view.detail}”` : view.detail}</span> : null}
      <Icon className={cn('size-3.5 shrink-0', view.state === 'running' && 'animate-spin')} aria-hidden="true" />
      {view.errorText ? <span className="w-full opacity-80">原因：{view.errorText}</span> : null}
      {/* 原始工具名对教师核实有用，但对着学生太技术，压到很小且只在有名字时显示。 */}
      <span className="sr-only">工具标识：{view.toolName}</span>
    </div>
  );
}
