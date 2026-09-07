import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reduceMessageQueue, type QueuedStudentMessage } from '../../hooks/use-message-queue.ts';

test('discards queued messages after the conversation becomes permanently locked', () => {
  const message: QueuedStudentMessage = { id: 'message-1', text: '继续追问', body: {} };
  const queued = reduceMessageQueue([], { kind: 'enqueue', message });

  const discarded = reduceMessageQueue(queued, { kind: 'discard' });

  assert.deepEqual(discarded, []);
});
