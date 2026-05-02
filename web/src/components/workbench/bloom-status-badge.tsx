import { Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';

export type BloomStatus =
  | { state: 'pending' }
  | { state: 'classified'; level: BloomLevel }
  | { state: 'failed'; reason?: string }
  | { state: 'unclassified' };

export function BloomStatusBadge({ status }: { status: BloomStatus }) {
  if (status.state === 'classified') return <BloomBadge level={status.level} />;
  if (status.state === 'failed') {
    return (
      <Badge variant="destructive" title={status.reason ?? '分类失败'}>
        <AlertTriangle className="mr-1 size-3" />布鲁姆分类失败
      </Badge>
    );
  }
  if (status.state === 'pending') {
    return (
      <Badge variant="outline" className="bg-muted/60">
        <Clock className="mr-1 size-3" />等待布鲁姆分类
      </Badge>
    );
  }
  return <Badge variant="secondary">未分类</Badge>;
}

export function BloomText({ level }: { level: BloomLevel }) {
  const info = bloomLevelInfo[level];
  return <span>L{level} {info.label} · {info.hint}</span>;
}
