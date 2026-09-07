import type { LucideIcon } from 'lucide-react';
import { Brush, Flower2, Moon, Sprout, Stamp, Trees } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { AvatarKey } from '@/lib/account-settings';
import { cn } from '@/lib/utils';

type AvatarOption = {
  readonly key: AvatarKey;
  readonly label: string;
  readonly icon: LucideIcon;
};

export const accountAvatarOptions = [
  { key: 'ink', label: '墨砚', icon: Brush },
  { key: 'pine', label: '松影', icon: Trees },
  { key: 'cinnabar', label: '朱印', icon: Stamp },
  { key: 'moon', label: '月白', icon: Moon },
  { key: 'bamboo', label: '竹简', icon: Sprout },
  { key: 'plum', label: '梅枝', icon: Flower2 },
] as const satisfies readonly AvatarOption[];

type AccountAvatarProps = {
  readonly avatarKey: AvatarKey;
  readonly className?: string;
  readonly iconClassName?: string;
};

export function AccountAvatar({ avatarKey, className, iconClassName }: AccountAvatarProps) {
  const option = accountAvatarOptions.find((candidate) => candidate.key === avatarKey);
  const Icon = option?.icon ?? Brush;

  return (
    <Avatar className={cn('size-12 ring-1 ring-primary/20', className)}>
      <AvatarFallback className="bg-primary/10 text-primary">
        <Icon className={cn('size-5', iconClassName)} aria-hidden="true" />
        <span className="sr-only">{option?.label ?? '墨砚'}头像</span>
      </AvatarFallback>
    </Avatar>
  );
}
