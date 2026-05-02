'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from './bloom-badge';
import { Lock } from 'lucide-react';

interface BloomLevelNode {
  questions: { id: string; text: string }[];
}

interface Props {
  levels: Partial<Record<BloomLevel, BloomLevelNode>>;
  currentMaxLevel?: BloomLevel;
}

export function BloomLadder({ levels, currentMaxLevel }: Props) {
  return (
    <div className="relative py-6" aria-label="布鲁姆六层认知路径">
      <div className="space-y-4">
        {([6, 5, 4, 3, 2, 1] as BloomLevel[]).map((level) => {
          const data = levels[level] ?? { questions: [] };
          const isActive = currentMaxLevel ? level <= currentMaxLevel : false;
          const isCurrent = level === currentMaxLevel;
          const info = bloomLevelInfo[level];

          return (
            <div key={level} className="grid gap-3 sm:grid-cols-[7rem_1fr] sm:items-center">
              <div className="sm:text-right"><BloomBadge level={level} /></div>
              <Card
                className={cn('p-3 transition-all hover:-translate-y-0.5 hover:shadow-md', !isActive && 'border-dashed opacity-70', isCurrent && 'ring-2 ring-accent ring-offset-1')}
              >
                <div className="mb-2 text-xs text-muted-foreground">{info.hint}</div>
                {data.questions.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {data.questions.map((q) => (
                      <Tooltip key={q.id}>
                        <TooltipTrigger render={
                          <button
                            type="button"
                            className="size-8 rounded-full text-[10px] font-medium text-white transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                            style={{ backgroundColor: `var(--bloom-${level})` }}
                            aria-label={`L${level} ${info.label}问题：${q.text}`}
                          >
                            问
                          </button>
                        } />
                        <TooltipContent>{q.text}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Lock className="size-3" aria-hidden="true" />
                    {currentMaxLevel ? '暂无该层级记录' : '尚无真实分类数据'}
                  </div>
                )}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
