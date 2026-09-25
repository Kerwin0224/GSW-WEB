import type { SpaceColorKey } from '@/lib/supabase/database.types';

export const SPACE_COLOR_KEYS = ['ink', 'pine', 'cinnabar', 'moon', 'bamboo', 'plum'] as const satisfies readonly SpaceColorKey[];

export const SPACE_COLOR_LABELS: Record<SpaceColorKey, string> = {
  ink: '墨砚',
  pine: '松影',
  cinnabar: '朱印',
  moon: '月白',
  bamboo: '竹简',
  plum: '梅枝',
};

export const SPACE_COLOR_DOT_CLASSES: Record<SpaceColorKey, string> = {
  ink: 'bg-slate-800',
  pine: 'bg-emerald-600',
  cinnabar: 'bg-red-600',
  moon: 'bg-indigo-400',
  bamboo: 'bg-lime-600',
  plum: 'bg-fuchsia-600',
};
