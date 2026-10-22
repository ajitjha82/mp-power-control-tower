import type { LucideIcon } from 'lucide-react'
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Eye,
  HelpCircle,
  MinusCircle,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import type { RiskLevel, Severity, Tone } from '@/types'
import { cn } from '@/lib/utils'

/**
 * Single source of truth for business status presentation.
 * Every status renders icon + label + colour (never colour alone).
 */
const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/30',
  destructive: 'bg-destructive-soft text-destructive border-destructive/25',
  info: 'bg-info-soft text-info border-info/25',
  neutral: 'bg-muted text-muted-foreground border-border',
}

const STATUS_MAP: Record<string, [Tone, LucideIcon]> = {
  Compliant: ['success', CheckCircle2],
  'Fully Compliant': ['success', CheckCircle2],
  'Non-Compliant': ['destructive', XCircle],
  Missing: ['destructive', XCircle],
  Short: ['warning', AlertTriangle],
  Mismatch: ['warning', AlertTriangle],
  Pending: ['neutral', Clock],
  'Under Review': ['info', Eye],
  'Not Applicable': ['neutral', MinusCircle],
  Resolved: ['success', CheckCircle2],
  Blocked: ['destructive', Ban],
  Approved: ['success', CheckCircle2],
  Paid: ['success', CheckCircle2],
  Overdue: ['destructive', AlertOctagon],
  Delayed: ['destructive', Clock],
  Partial: ['warning', AlertTriangle],
  'Amount Mismatch': ['warning', AlertTriangle],
  'Payment Pending': ['info', Clock],
  Submitted: ['neutral', CircleDashed],
  'Under Scrutiny': ['info', Eye],
  Returned: ['warning', RotateCcw],
  Open: ['warning', CircleDashed],
  'Awaiting Vendor': ['neutral', Clock],
  'Vendor Responded': ['info', RotateCcw],
  Escalated: ['destructive', ShieldAlert],
  'Pending Approval': ['info', Clock],
  Corrected: ['success', CheckCircle2],
  Rejected: ['destructive', XCircle],
  Active: ['success', CheckCircle2],
  Separated: ['neutral', MinusCircle],
  'On Notice': ['warning', Clock],
  Suspended: ['destructive', Ban],
  Expiring: ['destructive', AlertTriangle],
  'Renewal Due': ['warning', Clock],
  Passed: ['success', CheckCircle2],
  Provisional: ['info', Eye],
  Connected: ['success', CheckCircle2],
  Degraded: ['warning', AlertTriangle],
  Planned: ['neutral', CircleDashed],
}

export function statusTone(status: string): Tone {
  return STATUS_MAP[status]?.[0] ?? 'neutral'
}

export function StatusBadge({ status, className, size = 'sm' }: { status: string; className?: string; size?: 'sm' | 'xs' }) {
  const [tone, Icon] = STATUS_MAP[status] ?? ['neutral', HelpCircle]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-1.5 py-px text-2xs',
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-3.5' : 'size-3'} aria-hidden />
      {status}
    </span>
  )
}

const SEV: Record<Severity, [string, string]> = {
  Critical: ['bg-destructive text-destructive-foreground border-destructive', '▲▲'],
  High: ['bg-destructive-soft text-destructive border-destructive/30', '▲'],
  Medium: ['bg-warning-soft text-warning border-warning/30', '■'],
  Low: ['bg-muted text-muted-foreground border-border', '▼'],
}
export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const [cls, glyph] = SEV[severity]
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide', cls, className)}>
      <span aria-hidden className="text-[9px] leading-none">{glyph}</span>
      {severity}
    </span>
  )
}

const RISK: Record<RiskLevel, string> = {
  Critical: 'bg-destructive text-destructive-foreground border-destructive',
  High: 'bg-destructive-soft text-destructive border-destructive/30',
  Medium: 'bg-warning-soft text-warning border-warning/30',
  Low: 'bg-success-soft text-success border-success/25',
}
export function RiskBadge({ level, score, className }: { level: RiskLevel; score?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-semibold', RISK[level], className)}>
      <ShieldAlert className="size-3.5" aria-hidden />
      {level}
      {score !== undefined && <span className="num font-mono opacity-80">{score}</span>}
    </span>
  )
}

export const toneText: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
  neutral: 'text-foreground',
}
export const toneBg: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
}

/** Threshold → tone for compliance-like percentages. */
export function pctTone(v: number, good = 97, warn = 95): 'success' | 'warning' | 'destructive' {
  return v >= good ? 'success' : v >= warn ? 'warning' : 'destructive'
}
