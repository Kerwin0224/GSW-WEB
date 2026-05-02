import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const bloomLevelInfo: Record<BloomLevel, { label: string; hint: string; meaning: string }> = {
  1: { label: '记忆', hint: '背诵、识记、找出处', meaning: 'recognize / recall' },
  2: { label: '理解', hint: '解释、翻译、概括', meaning: 'explain / summarize' },
  3: { label: '应用', hint: '套用、迁移、举例', meaning: 'transfer / use' },
  4: { label: '分析', hint: '比较、拆解、找关系', meaning: 'compare / decompose' },
  5: { label: '评价', hint: '判断、论证、评价', meaning: 'judge / argue' },
  6: { label: '创造', hint: '仿写、创作、重组', meaning: 'compose / recombine' },
};

export function BloomBadge({ level, className }: { level: number; className?: string }) {
  const safeLevel = ([1, 2, 3, 4, 5, 6].includes(level) ? level : 1) as BloomLevel;
  const info = bloomLevelInfo[safeLevel];
  return (
    <Badge
      className={cn('font-heading tracking-wider border-2 border-current/20 shadow-sm', className)}
      style={{ backgroundColor: `var(--bloom-${safeLevel})`, color: 'white' }}
      title={`L${safeLevel} ${info.label}：${info.hint}`}
      aria-label={`布鲁姆 L${safeLevel} ${info.label}，${info.hint}`}
    >
      L{safeLevel} {info.label}
    </Badge>
  );
}
