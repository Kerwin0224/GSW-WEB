/**
 * use-bloom-status.ts
 *
 * 学生会话中布鲁姆认知路径状态的管理。
 * 追踪每条用户消息的 Bloom 分类状态（pending / classified / failed / queued）。
 */

import { useCallback, useState } from 'react';
import type { BloomStatus } from '@/components/workbench/bloom-status-badge';

type StudentBloomData =
  | { messageId: string; state: 'pending' }
  | { messageId: string; state: 'classified'; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { messageId: string; state: 'failed'; reason?: string };

export type { StudentBloomData };

export function useBloomStatus(initial?: Record<string, BloomStatus>) {
  const [bloomStatus, setBloomStatus] = useState<Record<string, BloomStatus>>(initial ?? {});

  const applyBloomStatus = useCallback((status: StudentBloomData) => {
    setBloomStatus((current) => ({
      ...current,
      [status.messageId]: status.state === 'classified'
        ? { state: 'classified', level: status.level }
        : status.state === 'failed'
          ? { state: 'failed', reason: status.reason }
          : { state: 'pending' },
    }));
  }, []);

  const markQueued = useCallback((messageId: string) => {
    setBloomStatus((current) => ({ ...current, [messageId]: { state: 'queued' } }));
  }, []);

  const markPending = useCallback((messageId: string) => {
    setBloomStatus((current) => ({ ...current, [messageId]: { state: 'pending' } }));
  }, []);

  const reset = useCallback((next?: Record<string, BloomStatus>) => {
    setBloomStatus(next ?? {});
  }, []);

  return { bloomStatus, setBloomStatus, applyBloomStatus, markQueued, markPending, reset } as const;
}
