import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getChallengeClimbProgress } from '../challenge-progression.ts';

test('challenge climb starts at L1 when there are no evaluated challenge records', () => {
  const progress = getChallengeClimbProgress([]);

  assert.equal(progress.currentLevel, 1);
  assert.equal(progress.completedLevels, 0);
  assert.equal(progress.isComplete, false);
  assert.equal(progress.levels[0]?.state, 'current');
  assert.equal(progress.levels[1]?.state, 'locked');
});

test('challenge climb stays at L1 when the L1 answer has not achieved the target', () => {
  const progress = getChallengeClimbProgress([
    { target_bloom_level: 1, achieved: false, evaluation_state: 'evaluated' },
  ]);

  assert.equal(progress.currentLevel, 1);
  assert.equal(progress.completedLevels, 0);
  assert.equal(progress.levels[0]?.state, 'current');
  assert.equal(progress.levels[1]?.state, 'locked');
});

test('challenge climb unlocks L2 only after L1 is achieved', () => {
  const progress = getChallengeClimbProgress([
    { target_bloom_level: 1, achieved: true, evaluation_state: 'evaluated' },
  ]);

  assert.equal(progress.currentLevel, 2);
  assert.equal(progress.completedLevels, 1);
  assert.equal(progress.levels[0]?.state, 'achieved');
  assert.equal(progress.levels[1]?.state, 'current');
  assert.equal(progress.levels[2]?.state, 'locked');
});

test('challenge climb ignores higher-level passes until all lower levels are achieved', () => {
  const progress = getChallengeClimbProgress([
    { target_bloom_level: 2, achieved: true, evaluation_state: 'evaluated' },
  ]);

  assert.equal(progress.currentLevel, 1);
  assert.equal(progress.completedLevels, 0);
  assert.equal(progress.levels[0]?.state, 'current');
  assert.equal(progress.levels[1]?.state, 'locked');
});

test('challenge climb is complete only after L1 through L6 are achieved', () => {
  const progress = getChallengeClimbProgress([
    { target_bloom_level: 1, achieved: true, evaluation_state: 'evaluated' },
    { target_bloom_level: 2, achieved: true, evaluation_state: 'evaluated' },
    { target_bloom_level: 3, achieved: true, evaluation_state: 'evaluated' },
    { target_bloom_level: 4, achieved: true, evaluation_state: 'evaluated' },
    { target_bloom_level: 5, achieved: true, evaluation_state: 'evaluated' },
    { target_bloom_level: 6, achieved: true, evaluation_state: 'evaluated' },
  ]);

  assert.equal(progress.currentLevel, 6);
  assert.equal(progress.completedLevels, 6);
  assert.equal(progress.isComplete, true);
  assert.deepEqual(progress.levels.map((level) => level.state), [
    'achieved',
    'achieved',
    'achieved',
    'achieved',
    'achieved',
    'achieved',
  ]);
});
