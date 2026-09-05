import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildStudentChatRequestBody,
  buildStudentConversationHref,
  getStudentChatBlockedReasons,
  shouldClassifyProjectForStudentTurn,
  shouldReplaceStudentConversationHref,
} from '../student-chat-contract.ts';

test('global empty first turn runs project classification once', () => {
  assert.equal(shouldClassifyProjectForStudentTurn({
    hasConversation: false,
    hasProject: false,
    isRegeneration: false,
  }), true);
});

test('project entry inherits the project and skips project classification', () => {
  assert.equal(shouldClassifyProjectForStudentTurn({
    hasConversation: false,
    hasProject: true,
    isRegeneration: false,
  }), false);
});

test('existing conversation skips project classification for follow-up turns', () => {
  assert.equal(shouldClassifyProjectForStudentTurn({
    hasConversation: true,
    hasProject: false,
    isRegeneration: false,
  }), false);
});

test('regeneration never runs project classification', () => {
  assert.equal(shouldClassifyProjectForStudentTurn({
    hasConversation: false,
    hasProject: false,
    isRegeneration: true,
  }), false);
});

test('project classification blocker is shown only when global empty entry requires it', () => {
  const reasons = getStudentChatBlockedReasons({
    providerBlocked: 'student chat blocked',
    projectClassificationBlocked: 'project classification blocked',
    bloomClassificationBlocked: 'bloom classification blocked',
    projectClassificationRequired: false,
  });

  assert.deepEqual(reasons, ['student chat blocked', 'bloom classification blocked']);
});

test('global empty entry shows project classification blocker', () => {
  const reasons = getStudentChatBlockedReasons({
    projectClassificationBlocked: 'project classification blocked',
    projectClassificationRequired: true,
  });

  assert.deepEqual(reasons, ['project classification blocked']);
});

test('request body keeps project context for a new project-entry conversation', () => {
  assert.deepEqual(buildStudentChatRequestBody({
    projectId: 'project-1',
    projectTitle: '静夜思',
  }), {
    projectId: 'project-1',
    projectTitle: '静夜思',
  });
});

test('request body prefers existing conversation over project context', () => {
  assert.deepEqual(buildStudentChatRequestBody({
    conversationId: 'conversation-1',
    projectId: 'project-1',
    projectTitle: '静夜思',
  }), {
    conversationId: 'conversation-1',
  });
});

test('request body keeps project id even before the project title is loaded', () => {
  assert.deepEqual(buildStudentChatRequestBody({
    projectId: 'project-1',
  }), {
    projectId: 'project-1',
  });
});

test('request body keeps queued fallback only for global empty entry', () => {
  assert.deepEqual(buildStudentChatRequestBody({
    fallback: { projectId: 'classified-later' },
  }), {
    projectId: 'classified-later',
  });
});

test('student conversation route is canonicalized by conversation id', () => {
  assert.equal(buildStudentConversationHref('conversation-1'), '/student?conversationId=conversation-1');
});

test('student route is replaced when the current url has no conversation id', () => {
  assert.equal(shouldReplaceStudentConversationHref({
    currentPathname: '/student',
    currentSearch: '',
    conversationId: 'conversation-1',
  }), true);
});

test('student route is replaced when project context still owns the url', () => {
  assert.equal(shouldReplaceStudentConversationHref({
    currentPathname: '/student',
    currentSearch: '?projectId=project-1',
    conversationId: 'conversation-1',
  }), true);
});

test('student route is not replaced when it already points at the active conversation', () => {
  assert.equal(shouldReplaceStudentConversationHref({
    currentPathname: '/student',
    currentSearch: '?conversationId=conversation-1',
    conversationId: 'conversation-1',
  }), false);
});
