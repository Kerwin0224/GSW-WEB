import { BLOOM_LEVELS, type BloomLevel } from './bloom-levels.ts';

// 六层的唯一定义在 lib/bloom-levels.ts；这里重导出，维持既有调用点（lib/data/student.ts 等）。
export type { BloomLevel } from './bloom-levels.ts';

export type ChallengeProgressRecord = {
  target_bloom_level: number;
  achieved: boolean | null;
  evaluation_state: string;
};

export type ChallengeLevelState = 'achieved' | 'current' | 'locked';

export type ChallengeLevelProgress = {
  level: BloomLevel;
  state: ChallengeLevelState;
};

export type ChallengeClimbProgress = {
  currentLevel: BloomLevel;
  completedLevels: number;
  isComplete: boolean;
  levels: ChallengeLevelProgress[];
};

export function getChallengeClimbProgress(records: ChallengeProgressRecord[]): ChallengeClimbProgress {
  const achievedLevels = new Set(
    records
      .filter((record) => record.evaluation_state === 'evaluated' && record.achieved === true)
      .map((record) => record.target_bloom_level),
  );
  const nextLevel = BLOOM_LEVELS.find((level) => !achievedLevels.has(level));
  const completedLevels = nextLevel ? nextLevel - 1 : BLOOM_LEVELS.length;
  const currentLevel = nextLevel ?? 6;

  return {
    currentLevel,
    completedLevels,
    isComplete: completedLevels === BLOOM_LEVELS.length,
    levels: BLOOM_LEVELS.map((level) => ({
      level,
      state: level <= completedLevels ? 'achieved' : level === currentLevel && nextLevel ? 'current' : 'locked',
    })) satisfies ChallengeLevelProgress[],
  };
}
