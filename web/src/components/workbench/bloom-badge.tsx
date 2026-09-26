import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { BLOOM_LEVEL_INFO, toBloomLevel } from '@/lib/bloom-levels';

/**
 * 层级徽章。六层的名称、提示、色号索引都来自 lib/bloom-levels.ts 的唯一定义
 * （此前这个文件自带一份 bloomLevelInfo，与提示词里的另外三份各自漂移）。
 */
export function BloomBadge({ level, className }: { level: number; className?: string }) {
  const safeLevel = toBloomLevel(level) ?? 1;
  const info = BLOOM_LEVEL_INFO[safeLevel];
  return (
    <Badge
      className={cn('font-heading tracking-wider border-2 border-current/20', className)}
      style={{ backgroundColor: `var(--bloom-${safeLevel})`, color: `var(--bloom-${safeLevel}-fg)` }}
      title={`L${safeLevel} ${info.name}：${info.hint}`}
      aria-label={`布鲁姆 L${safeLevel} ${info.name}，${info.hint}`}
    >
      L{safeLevel} {info.name}
    </Badge>
  );
}
