export type ChallengeProgressRecord = {
  target_bloom_level: number;
  achieved: boolean | null;
  evaluation_state: string;
};

export type ChallengeLevelState = 'achieved' | 'current' | 'locked';

export type ChallengeLevelProgress = {
  level: number;
  state: ChallengeLevelState;
};

export type ChallengeClimbProgress = {
  currentLevel: number;
  completedLevels: number;
  isComplete: boolean;
  levels: ChallengeLevelProgress[];
};

const bloomLevels = [1, 2, 3, 4, 5, 6] as const;

export function getChallengeClimbProgress(records: ChallengeProgressRecord[]): ChallengeClimbProgress {
  const achievedLevels = new Set(
    records
      .filter((record) => record.evaluation_state === 'evaluated' && record.achieved === true)
      .map((record) => record.target_bloom_level),
  );
  const nextLevel = bloomLevels.find((level) => !achievedLevels.has(level));
  const completedLevels = nextLevel ? nextLevel - 1 : bloomLevels.length;
  const currentLevel = nextLevel ?? 6;

  return {
    currentLevel,
    completedLevels,
    isComplete: completedLevels === bloomLevels.length,
    levels: bloomLevels.map((level) => ({
      level,
      state: level <= completedLevels ? 'achieved' : level === currentLevel && nextLevel ? 'current' : 'locked',
    })),
  };
}
