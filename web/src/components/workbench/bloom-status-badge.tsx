import { Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BloomBadge, bloomLevelInfo, type BloomLevel } from '@/components/workbench/bloom-badge';

export type BloomStatus =
  | { state: 'pending' }
  | { state: 'queued' }
  | { state: 'classified'; level: BloomLevel }
  | { state: 'failed'; reason?: string }
  | { state: 'unclassified' };

export function BloomStatusBadge({ status }: { status: BloomStatus }) {
  if (status.state === 'classified') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">提问类型</span>
        <BloomBadge level={status.level} />
      </span>
    );
  }
  if (status.state === 'failed') {
    return (
      <Badge variant="destructive" title={status.reason ?? '提问类型判断失败'}>
        <AlertTriangle className="mr-1 size-3" />提问类型判断失败
      </Badge>
    );
  }
  if (status.state === 'pending') {
    return (
      <Badge variant="outline" className="bg-muted/60">
        <Clock className="mr-1 size-3" />正在判断提问类型
      </Badge>
    );
  }
  if (status.state === 'queued') {
    return (
      <Badge variant="outline" className="bg-muted/60">
        <Clock className="mr-1 size-3" />回答排队中
      </Badge>
    );
  }
  return <Badge variant="secondary">未判断提问类型</Badge>;
}

export function BloomText({ level }: { level: BloomLevel }) {
  const info = bloomLevelInfo[level];
  return <span>提问类型：L{level} {info.label} · {info.hint}</span>;
}
