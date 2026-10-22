import { useState } from 'react'
import { Command } from 'cmdk'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export interface Option {
  value: string
  label: string
  hint?: string
}

/** Searchable multi-select built on cmdk + Radix Popover (keyboard accessible). */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  single,
  className,
  disabled,
}: {
  label: string
  options: Option[]
  value: string[]
  onChange: (v: string[]) => void
  single?: boolean
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = new Set(value)
  const summary = value.length === 0 ? 'All' : value.length === 1 ? options.find((o) => o.value === value[0])?.label ?? value[0] : `${value.length} selected`
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${summary}`}
          className={cn(
            'flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            value.length > 0 && 'border-secondary/50 bg-secondary/5',
            className,
          )}
        >
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className={cn('truncate font-medium', value.length === 0 && 'text-muted-foreground')}>{summary}</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <Command loop>
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 text-muted-foreground" aria-hidden />
            <Command.Input placeholder={`Search ${label.toLowerCase()}…`} className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <Command.List className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
            <Command.Empty className="px-2 py-6 text-center text-xs text-muted-foreground">No matches.</Command.Empty>
            {options.map((o) => {
              const on = selected.has(o.value)
              return (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    if (single) {
                      onChange(on ? [] : [o.value])
                      setOpen(false)
                    } else onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent"
                >
                  <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-[3px] border', on ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-input')}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{o.hint}</span>}
                </Command.Item>
              )
            })}
          </Command.List>
        </Command>
        {value.length > 0 && (
          <div className="flex justify-between border-t p-1.5">
            <Button variant="ghost" size="xs" onClick={() => onChange([])}>
              Clear
            </Button>
            <Button size="xs" variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
