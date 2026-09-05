'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type ModelComboboxOption = { id: string; ownedBy?: string };

/**
 * 可搜索模型选择框：打字即在已拉取模型中本地过滤，列表外可直接手输任意 model ID
 * （很多兼容端点的 /models 返回不全，手输是正式路径而非兜底）。
 * CommandInput 的值即当前 modelId：筛选与输入共用一个受控值。
 */
export function ModelCombobox({ id, value, onValueChange, models, placeholder = '搜索或输入模型 ID' }: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  models: ModelComboboxOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
      <PopoverTrigger
        id={id}
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-mono font-normal"
          />
        }
      >
        <span className="truncate">{value || <span className="font-sans text-muted-foreground">{placeholder}</span>}</span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput value={value} onValueChange={onValueChange} placeholder="输入关键字过滤，或直接输入模型 ID" />
          <CommandList>
            <CommandEmpty>没有匹配的已拉取模型 — 直接使用输入值即可。</CommandEmpty>
            <CommandGroup>
              {models.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => {
                    onValueChange(model.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 size-4', value === model.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{model.id}</span>
                  {model.ownedBy ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{model.ownedBy}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
