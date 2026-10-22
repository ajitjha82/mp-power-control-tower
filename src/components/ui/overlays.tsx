import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------- Tooltip ----------
export const TooltipProvider = TooltipPrimitive.Provider
export function Tip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-xs rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

// ---------- Dialog & Sheet ----------
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const Overlay = () => <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

export function DialogContent({ className, children, title, description, ...p }: Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          className,
        )}
        {...p}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Close">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetContent({ className, children, title, description, side = 'right', ...p }: Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> & { title: React.ReactNode; description?: React.ReactNode; side?: 'right' | 'left' }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-200',
          side === 'right' ? 'right-0 border-l data-[state=open]:slide-in-from-right sm:max-w-xl' : 'left-0 border-r data-[state=open]:slide-in-from-left max-w-[280px]',
          className,
        )}
        {...p}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">Details</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Close panel">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// ---------- Dropdown ----------
export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export function DropdownMenuContent({ className, align = 'end', ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95', className)}
        {...p}
      />
    </DropdownPrimitive.Portal>
  )
}
export const DropdownMenuItem = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) => (
  <DropdownPrimitive.Item
    className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4', className)}
    {...p}
  />
)
export const DropdownMenuCheckboxItem = ({ className, children, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>) => (
  <DropdownPrimitive.CheckboxItem
    className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-accent', className)}
    {...p}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.CheckboxItem>
)
export const DropdownMenuLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) => (
  <DropdownPrimitive.Label className={cn('px-2 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground', className)} {...p} />
)
export const DropdownMenuSeparator = () => <DropdownPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup
export const DropdownMenuRadioItem = ({ className, children, ...p }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem>) => (
  <DropdownPrimitive.RadioItem
    className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none data-[highlighted]:bg-accent', className)}
    {...p}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownPrimitive.ItemIndicator>
        <span className="size-1.5 rounded-full bg-current" />
      </DropdownPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownPrimitive.RadioItem>
)

// ---------- Popover ----------
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export function PopoverContent({ className, align = 'start', ...p }: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 w-72 rounded-md border bg-popover p-0 text-popover-foreground shadow-lg outline-none animate-in fade-in-0 zoom-in-95', className)}
        {...p}
      />
    </PopoverPrimitive.Portal>
  )
}

// ---------- Tabs ----------
export const Tabs = TabsPrimitive.Root
export const TabsList = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn('flex w-full items-center gap-1 overflow-x-auto border-b scrollbar-thin', className)} {...p} />
)
export const TabsTrigger = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-secondary data-[state=active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    {...p}
  />
)
export const TabsContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('pt-4 focus-visible:outline-none', className)} {...p} />
)

// ---------- Checkbox ----------
export const Checkbox = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(({ className, ...p }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 rounded-[3px] border border-input bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[state=indeterminate]:bg-secondary data-[state=indeterminate]:text-secondary-foreground',
      className,
    )}
    {...p}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      {p.checked === 'indeterminate' ? <span className="h-0.5 w-2 bg-current" /> : <Check className="size-3" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = 'Checkbox'
