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
      label: '已通过',
      ariaLabel: `《${row.title}》L${level} ${info.label} 已通过挑战`,
      icon: CheckCircle2,
      className: 'border-transparent shadow-sm',
      style: { backgroundColor: `var(--bloom-${level})`, color: `var(--bloom-${level}-fg)` },
    };
  }

  if (state === 'current') {
    return {
      label: '待挑战',
      ariaLabel: `《${row.title}》L${level} ${info.label} 待挑战`,
      icon: Circle,
      className: 'border-primary/55 bg-primary/10 text-primary ring-1 ring-primary/20',
      style: undefined,
    };
  }

  return {
    label: '未开放',
    ariaLabel: `《${row.title}》L${level} ${info.label} 未开放`,
    icon: Lock,
    className: 'border-border/45 bg-muted/40 text-muted-foreground',
    style: undefined,
  };
}

export function CognitiveProfileMatrix({ rows }: { rows: ProjectBloomMatrixRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background/50">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <caption className="sr-only">每个篇目在 L1 到 L6 六个层级上的挑战通过状态</caption>
          <thead>
            <tr className="border-b bg-muted/45">
              <th scope="col" className="w-[15rem] px-4 py-3 text-left font-medium text-muted-foreground">篇目</th>
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
                    {row.confirmedLevel ? `已通过到 L${row.confirmedLevel}` : '尚未通过挑战'}
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
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-primary" />已通过</span>
        <span className="inline-flex items-center gap-1.5"><Circle className="size-3.5 text-primary" />待挑战</span>
        <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" />未开放</span>
      </div>
    </div>
  );
}
