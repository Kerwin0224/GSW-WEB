/**
 * use-message-queue.ts
 *
 * 学生会话消息排队机制。
 * 当 AI 正在流式回答时，后续学生消息进入队列，
 * 等 AI 回答完成后自动逐条发送。
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';

export type QueuedStudentMessage = { readonly id: string; readonly text: string; readonly body: Readonly<Record<string, unknown>> };

type MessageQueueAction =
  | { readonly kind: 'enqueue'; readonly message: QueuedStudentMessage }
  | { readonly kind: 'dequeue' }
  | { readonly kind: 'discard' };

function assertNever(action: never): never {
  throw new TypeError(`Unexpected message queue action: ${JSON.stringify(action)}`);
}

export function reduceMessageQueue(queue: readonly QueuedStudentMessage[], action: MessageQueueAction): readonly QueuedStudentMessage[] {
  switch (action.kind) {
    case 'enqueue':
      return [...queue, action.message];
    case 'dequeue':
      return queue.slice(1);
    case 'discard':
      return [];
    default:
      return assertNever(action);
  }
}

export function useMessageQueue({
  busy,
  blocked,
  discard,
  onDequeue,
}: {
  /** useChat 是否正在 submitted/streaming */
  busy: boolean;
  /** 是否被阻塞（provider 未就绪或会话已锁定） */
  blocked: boolean;
  /** 永久阻塞时是否丢弃待发送内容 */
  discard: boolean;
  /** 队列头部消息出队时的回调 */
  onDequeue: (message: QueuedStudentMessage) => void;
}) {
  const [queue, dispatch] = useReducer(reduceMessageQueue, []);
  const queueRef = useRef<readonly QueuedStudentMessage[]>([]);

  useEffect(() => {
    if (!discard) return;
    queueRef.current = [];
    dispatch({ kind: 'discard' });
  }, [discard]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // 当 AI 空闲且队列非空时，自动出队
  useEffect(() => {
    if (busy || queueRef.current.length === 0 || blocked) return;
    const [next] = queueRef.current;
    dispatch({ kind: 'dequeue' });
    onDequeue(next);
  }, [busy, blocked, onDequeue]);

  const enqueue = useCallback((message: QueuedStudentMessage) => {
    dispatch({ kind: 'enqueue', message });
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    dispatch({ kind: 'discard' });
  }, []);

  const visibleQueue: readonly QueuedStudentMessage[] = blocked ? [] : queue;
  return { queue: visibleQueue, queueCount: visibleQueue.length, enqueue, clear } as const;
}
