/**
 * use-message-queue.ts
 *
 * 学生会话消息排队机制。
 * 当 AI 正在流式回答时，后续学生消息进入队列，
 * 等 AI 回答完成后自动逐条发送。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type QueuedStudentMessage = { id: string; text: string; body: Record<string, unknown> };

export function useMessageQueue({
  busy,
  blocked,
  onDequeue,
}: {
  /** useChat 是否正在 submitted/streaming */
  busy: boolean;
  /** 是否被阻塞（provider 未就绪或会话已锁定） */
  blocked: boolean;
  /** 队列头部消息出队时的回调 */
  onDequeue: (message: QueuedStudentMessage) => void;
}) {
  const [queue, setQueue] = useState<QueuedStudentMessage[]>([]);
  const queueRef = useRef<QueuedStudentMessage[]>([]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // 当 AI 空闲且队列非空时，自动出队
  useEffect(() => {
    if (busy || queueRef.current.length === 0 || blocked) return;
    const [next] = queueRef.current;
    setQueue((current) => current.slice(1));
    onDequeue(next);
  }, [busy, blocked, onDequeue]);

  const enqueue = useCallback((message: QueuedStudentMessage) => {
    setQueue((current) => [...current, message]);
  }, []);

  const clear = useCallback(() => {
    setQueue([]);
  }, []);

  return { queue, queueCount: queue.length, enqueue, clear } as const;
}
