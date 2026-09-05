import { CheckCircle2, Circle, Lock } from 'lucide-react';

import { bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';
import { cn } from '@/lib/utils';

type ProjectBloomMatrixRow = {
  id: string;
  title: string;
  confirmedLevel?: BloomLevel;
  statusLabel: string;
  levels: Array<{ level: BloomLevel; state: 'achieved' | 'current' | 'locked' }>;
};

const bloomLevels = [1, 2, 3, 4, 5, 6] as BloomLevel[];

function levelCellCopy(row: ProjectBloomMatrixRow, level: BloomLevel) {
  const state = row.levels.find((item) => item.level === level)?.state ?? 'locked';
  const info = bloomLevelInfo[level];

  if (state === 'achieved') {
    return {
      label: '已确认',
      ariaLabel: `《${row.title}》L${level} ${info.label} 已确认`,
      icon: CheckCircle2,
      className: 'border-transparent shadow-sm',
      style: { backgroundColor: `var(--bloom-${level})`, color: `var(--bloom-${level}-fg)` },
    };
  }

  if (state === 'current') {
    return {
      label: row.confirmedLevel ? '当前' : '待确认',
      ariaLabel: `《${row.title}》L${level} ${info.label} ${row.confirmedLevel ? '当前待挑战' : '等待挑战'}`,
      icon: Circle,
      className: 'border-primary/55 bg-primary/10 text-primary ring-1 ring-primary/20',
      style: undefined,
    };
  }

  return {
    label: '未解锁',
    ariaLabel: `《${row.title}》L${level} ${info.label} 未解锁`,
    icon: Lock,
    className: 'border-border/45 bg-muted/40 text-muted-foreground',
    style: undefined,
  };
}

export function CognitiveProfileMatrix({ rows }: { rows: ProjectBloomMatrixRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background/50" aria-label="各项目布鲁姆认知攀登进度">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <caption className="sr-only">每个项目在 L1 到 L6 六个布鲁姆层级上的挑战确认状态</caption>
          <thead>
            <tr className="border-b bg-muted/45">
              <th scope="col" className="w-[15rem] px-4 py-3 text-left font-medium text-muted-foreground">项目</th>
              {bloomLevels.map((level) => (
                <th key={level} scope="col" className="px-3 py-3 text-center font-medium text-muted-foreground">
                  <span className="block text-foreground">L{level}</span>
                  <span className="block text-xs font-normal">{bloomLevelInfo[level].label}</span>
                </th>
              ))}
              <th scope="col" className="w-[8rem] px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left align-middle font-medium">
                  <span className="line-clamp-2">《{row.title}》</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {row.confirmedLevel ? `已确认到 L${row.confirmedLevel}` : '尚无确认层级'}
                  </span>
                </th>
                {bloomLevels.map((level) => {
                  const cell = levelCellCopy(row, level);
                  const Icon = cell.icon;

                  return (
                    <td key={level} className="px-3 py-3 text-center align-middle">
                      <span
                        className={cn(
                          'mx-auto flex h-11 min-w-20 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
                          cell.className
                        )}
                        style={cell.style}
                        aria-label={cell.ariaLabel}
                        title={cell.ariaLabel}
                      >
                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                        {cell.label}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-3 align-middle text-sm text-muted-foreground">{row.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 border-t bg-muted/25 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" />已确认</span>
        <span className="inline-flex items-center gap-1.5"><Circle className="size-3.5 text-primary" />当前待确认</span>
        <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" />未解锁</span>
      </div>
    </div>
  );
}
