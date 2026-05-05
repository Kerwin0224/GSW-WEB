'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';

type RadarDatum = {
  level: string;
  count: number;
  fullMark: number;
};

export function CognitiveProfileRadar({ distribution }: { distribution: Array<{ level: number; count: number }> }) {
  const maxCount = Math.max(1, ...distribution.map((item) => item.count));
  const data: RadarDatum[] = ([1, 2, 3, 4, 5, 6] as BloomLevel[]).map((level) => {
    const count = distribution.find((item) => item.level === level)?.count ?? 0;
    return {
      level: `L${level} ${bloomLevelInfo[level].label}`,
      count,
      fullMark: maxCount,
    };
  });

  return (
    <div className="h-[22rem] w-full" aria-label="布鲁姆六维认知雷达图">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 352 }}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="level" tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, maxCount]} allowDataOverflow={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <Radar
            name="真实记录"
            dataKey="count"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.22}
            isAnimationActive={false}
          />
          <Tooltip
            formatter={(value) => [`${value} 条`, '真实记录']}
            contentStyle={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--card-foreground)',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
