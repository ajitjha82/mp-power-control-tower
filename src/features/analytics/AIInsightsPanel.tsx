import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Info, Sparkles, UserCheck } from 'lucide-react'
import { Section } from '@/components/layout/page'
import { BlockSkeleton, EmptyState, ErrorState } from '@/components/feedback/states'
import { SeverityBadge } from '@/components/feedback/status'
import { useScope } from '@/hooks/useScope'
import { simulate } from '@/services/api'
import { cn } from '@/lib/utils'
import { type Confidence, type Insight, computeInsights } from './insights'

const CONF_CLASS: Record<Confidence, string> = {
  High: 'border-success/25 bg-success-soft text-success',
  Medium: 'border-warning/30 bg-warning-soft text-warning',
  Low: 'border-border bg-muted text-muted-foreground',
}

export function AIBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-info/25 bg-info-soft px-2 py-0.5 text-2xs font-semibold text-info', className)}>
      <Sparkles className="size-3" aria-hidden /> AI Insight · advisory
    </span>
  )
}

function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  return (
    <article className={cn('flex min-w-0 flex-col rounded-lg border bg-card', compact ? 'gap-2 p-3' : 'gap-3 p-4')} aria-label={`AI insight: ${insight.title}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <AIBadge />
        <SeverityBadge severity={insight.severity} />
        <span className={cn('ml-auto inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-semibold', CONF_CLASS[insight.confidence])}>
          Confidence: {insight.confidence}
          {insight.confidencePct !== null && <span className="num ml-1 font-mono">{insight.confidencePct}%</span>}
        </span>
      </div>
      <h3 className={cn('font-semibold leading-snug', compact ? 'text-sm' : 'text-[0.95rem]')}>{insight.title}</h3>
      {!compact && <p className="text-xs leading-relaxed text-muted-foreground">{insight.explanation}</p>}
      <dl className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        {insight.metrics.slice(0, compact ? 2 : 3).map((m) => (
          <div key={m.label} className="min-w-0 rounded-md bg-muted/60 px-2 py-1.5">
            <dt className="truncate text-2xs text-muted-foreground">{m.label}</dt>
            <dd className="num truncate text-sm font-semibold">{m.value}</dd>
          </div>
        ))}
      </dl>
      {!compact && (
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <UserCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">Recommended human review: </span>
            {insight.review}
          </span>
        </p>
      )}
      <Link
        to={insight.evidenceHref}
        className="mt-auto inline-flex items-center gap-1 self-start rounded text-xs font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`View evidence: ${insight.evidenceLabel}`}
      >
        View evidence <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </article>
  )
}

/**
 * Advisory insight cards computed deterministically from the scoped demo data.
 * `compact` shows the top three in a tighter layout (Overview page).
 */
export function AIInsightsPanel({ compact }: { compact?: boolean }) {
  const { filters, key } = useScope()
  const q = useQuery({ queryKey: ['ai-insights', ...key], queryFn: () => simulate(() => computeInsights(filters)) })
  const list = q.data ? (compact ? q.data.slice(0, 3) : q.data) : []
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-4 text-info" aria-hidden /> AI Insights
        </span>
      }
      description={compact ? 'Top pattern detections for the current scope · advisory only' : 'Statistical pattern detections for the current scope. Advisory only — validate before acting.'}
      actions={
        compact ? (
          <Link to="/analytics" className="text-xs font-medium text-secondary hover:underline">
            All insights
          </Link>
        ) : undefined
      }
    >
      {q.isPending ? (
        <BlockSkeleton rows={compact ? 4 : 6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <EmptyState title="No notable patterns detected in the current scope." description="Insights appear when a metric deviates meaningfully from its baseline. Try widening the filters." />
      ) : (
        <div className={cn('grid gap-3', compact ? 'md:grid-cols-3' : 'md:grid-cols-2 2xl:grid-cols-3')}>
          {list.map((i) => (
            <InsightCard key={i.id} insight={i} compact={compact} />
          ))}
        </div>
      )}
      <p className={cn('flex gap-1.5 text-2xs leading-relaxed text-muted-foreground', compact ? 'mt-3' : 'mt-4 border-t pt-3')}>
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Insights are statistical pattern detections on fictional demo data. They are advisory, require human validation, and never trigger actions, notifications or invoice decisions automatically.
        </span>
      </p>
    </Section>
  )
}

export default AIInsightsPanel
