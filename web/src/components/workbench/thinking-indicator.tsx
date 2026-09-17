/**
 * AI 等待首字的统一反馈：一串呼吸圆点。
 * 学生端与教师端此前各写了一份完全相同的 JSX（含 comment 都互相指认"与学生端一致"），
 * 属于同一视觉事实的两份实现——改一处两端就漂移。收口到这里。
 */
export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2 pl-12" role="status" aria-label="正在思考">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
          style={{ animationDelay: `${dot * 150}ms` }}
        />
      ))}
    </div>
  );
}
