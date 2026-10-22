import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Bot, CornerDownLeft, Filter, FlaskConical, Lightbulb, MessageSquareText, RotateCcw, Send, User } from 'lucide-react'
import type { GlobalFilters, RiskLevel } from '@/types'
import { PageHeader, Section } from '@/components/layout/page'
import { C, ChartBox, ChartTooltip, Legend, SERIES, axisProps } from '@/components/charts/chart-kit'
import { ErrorState } from '@/components/feedback/states'
import { RiskBadge, StatusBadge } from '@/components/feedback/status'
import { Button, Input, Kbd, Skeleton } from '@/components/ui/primitives'
import { useScope } from '@/hooks/useScope'
import { useUrlParam } from '@/hooks/useUrlState'
import { simulate } from '@/services/api'
import { cn, fmtINR, fmtNum, fmtPct } from '@/lib/utils'
import { EXAMPLE_PROMPTS, type NlqAnswer, type NlqCell, type NlqChart, type NlqColumn, type NlqFmt, type NlqTable, answerQuestion } from './nlq'

interface Turn {
  id: number
  question: string
  filters: GlobalFilters
  state: 'pending' | 'done' | 'error'
  answer?: NlqAnswer
  error?: unknown
}

const fmtBy = (fmt: NlqFmt) => (v: number) => (fmt === 'pct' ? fmtPct(v) : fmt === 'inr' ? fmtINR(v, { compact: true }) : fmtNum(v))

// ---------- Answer pieces ----------
function AnswerChart({ chart }: { chart: NlqChart }) {
  const f = fmtBy(chart.fmt)
  if (chart.type === 'line') {
    return (
      <div className="space-y-2">
        <ChartBox height={220} label={`Line chart of ${chart.series.map((s) => s.label).join(' and ')}`}>
          <LineChart data={chart.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={C.grid} />
            <XAxis {...axisProps} dataKey={chart.xKey} />
            <YAxis {...axisProps} width={52} domain={['dataMin - 0.5', 'dataMax + 0.5']} tickFormatter={(v: number) => f(v)} />
            <Tooltip content={<ChartTooltip fmt={(v) => f(v)} />} />
            {chart.series.map((s, k) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[k % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ChartBox>
        {chart.series.length > 1 && <Legend items={chart.series.map((s, k) => ({ label: s.label, color: SERIES[k % SERIES.length]! }))} />}
      </div>
    )
  }
  const height = Math.max(160, chart.data.length * 26 + 30)
  return (
    <ChartBox height={height} label={`Bar chart of ${chart.series.map((s) => s.label).join(', ')} by ${chart.xKey}`}>
      <BarChart data={chart.data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis {...axisProps} type="number" tickFormatter={(v: number) => f(v)} domain={chart.fmt === 'pct' ? ['dataMin - 2', 100] : [0, 'auto']} allowDecimals={false} />
        <YAxis {...axisProps} type="category" dataKey={chart.xKey} width={150} />
        <Tooltip content={<ChartTooltip fmt={(v) => f(v)} />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
        {chart.series.map((s, k) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[k % SERIES.length]} radius={[0, 3, 3, 0]} barSize={16} />
        ))}
      </BarChart>
    </ChartBox>
  )
}

function renderCell(col: NlqColumn, row: Record<string, NlqCell>) {
  const v = row[col.key]
  if (v === undefined || v === '') return '—'
  switch (col.kind) {
    case 'num':
      return typeof v === 'number' ? (Number.isInteger(v) ? fmtNum(v) : v.toFixed(1)) : v
    case 'pct':
      return typeof v === 'number' ? fmtPct(v) : v
    case 'inr':
      return typeof v === 'number' ? fmtINR(v, { compact: true }) : v
    case 'status':
      return <StatusBadge status={String(v)} size="xs" />
    case 'risk':
      return <RiskBadge level={String(v) as RiskLevel} score={typeof row.riskScore === 'number' ? row.riskScore : undefined} />
    case 'id':
      return <span className="num font-mono text-[12px]">{v}</span>
    default:
      return v
  }
}

function AnswerTable({ table }: { table: NlqTable }) {
  const navigate = useNavigate()
  const isNumeric = (c: NlqColumn) => c.kind === 'num' || c.kind === 'pct' || c.kind === 'inr'
  const hrefOf = (row: Record<string, NlqCell>) => (table.linkPrefix && table.linkKey && row[table.linkKey] !== undefined ? `${table.linkPrefix}${row[table.linkKey]}` : null)
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="max-h-[360px] overflow-auto scrollbar-thin">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">Answer details</caption>
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              {table.columns.map((c) => (
                <th key={c.key} scope="col" className={cn('whitespace-nowrap border-b px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground', isNumeric(c) && 'text-right')}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, k) => {
              const href = hrefOf(r)
              return (
                <tr
                  key={k}
                  className={cn('border-b last:border-0', href && 'cursor-pointer hover:bg-accent/60')}
                  onClick={href ? () => navigate(href) : undefined}
                >
                  {table.columns.map((c, ci) => (
                    <td key={c.key} className={cn('whitespace-nowrap px-3 py-1.5', isNumeric(c) && 'num text-right')}>
                      {ci === 0 && href ? (
                        <Link to={href} onClick={(e) => e.stopPropagation()} className="font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {renderCell(c, r)}
                        </Link>
                      ) : (
                        renderCell(c, r)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {table.total > table.rows.length && (
        <p className="border-t bg-muted/40 px-3 py-1.5 text-2xs text-muted-foreground">
          Showing {fmtNum(table.rows.length)} of {fmtNum(table.total)} matching rows. Open the relevant module for the full list.
        </p>
      )}
    </div>
  )
}

function AnswerCard({ answer, onAsk }: { answer: NlqAnswer; onAsk: (q: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-2xs font-semibold text-warning">
          <FlaskConical className="size-3" aria-hidden /> Simulated analytics · demo data
        </span>
        {!answer.supported && <span className="rounded-full border bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">Not understood</span>}
      </div>
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Interpreted as</p>
        <p className="mt-0.5 text-xs italic text-muted-foreground">{answer.interpretedQuery}</p>
      </div>
      <p className="text-sm leading-relaxed">{answer.summary}</p>
      {answer.kpis.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Key figures">
          {answer.kpis.map((k) => (
            <li key={k.label} className="rounded-md border bg-muted/40 px-2.5 py-1.5">
              <span className="block text-2xs text-muted-foreground">{k.label}</span>
              <span className="num text-sm font-semibold">{k.value}</span>
            </li>
          ))}
        </ul>
      )}
      {answer.chart && <AnswerChart chart={answer.chart} />}
      {answer.table && <AnswerTable table={answer.table} />}
      {answer.appliedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground">
            <Filter className="size-3" aria-hidden /> Applied:
          </span>
          {answer.appliedFilters.map((a) => (
            <span key={a} className="rounded-full border bg-card px-2 py-0.5 text-2xs">
              {a}
            </span>
          ))}
        </div>
      )}
      {answer.followUps.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Lightbulb className="size-3" aria-hidden /> Follow-up questions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {answer.followUps.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onAsk(q)}
                className="rounded-full border border-secondary/30 bg-card px-2.5 py-1 text-left text-xs text-secondary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AnalysingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Analysing">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-secondary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-secondary" />
        </span>
        Analysing…
      </p>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28" />
        ))}
      </div>
      <Skeleton className="h-36 w-full" />
    </div>
  )
}

// ---------- Page ----------
export default function AskPage() {
  const { filters } = useScope()
  const [qParam, setQParam] = useUrlParam('q')
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [live, setLive] = useState('')
  const nextId = useRef(1)
  const lastAutoRun = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const execute = useCallback((id: number, question: string, f: GlobalFilters) => {
    setLive('Analysing your question…')
    simulate(() => answerQuestion(question, f), 650)
      .then((answer) => {
        setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, state: 'done', answer, error: undefined } : t)))
        setLive(`Answer: ${answer.summary}`)
      })
      .catch((error: unknown) => {
        setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, state: 'error', error } : t)))
        setLive('The analysis could not be completed. A retry option is available.')
      })
  }, [])

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim()
      if (!question) return
      const id = nextId.current++
      setTurns((ts) => [...ts, { id, question, filters, state: 'pending' }])
      setInput('')
      lastAutoRun.current = question
      setQParam(question)
      execute(id, question, filters)
    },
    [execute, filters, setQParam],
  )

  // Pre-run ?q= (deep link). Guarded so StrictMode / own URL updates don't re-ask.
  useEffect(() => {
    if (qParam && qParam !== lastAutoRun.current) {
      lastAutoRun.current = qParam
      ask(qParam)
    }
  }, [qParam, ask])

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [turns.length])

  const retry = (t: Turn) => {
    setTurns((ts) => ts.map((x) => (x.id === t.id ? { ...x, state: 'pending', error: undefined } : x)))
    execute(t.id, t.question, t.filters)
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    ask(input)
  }

  const clear = () => {
    setTurns([])
    setQParam(null)
    lastAutoRun.current = null
    inputRef.current?.focus()
  }

  const busy = turns.some((t) => t.state === 'pending')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ask MP Power Intelligence"
        subtitle="Conversational BI prototype. Questions are matched to predefined analyses over the scoped demo data — no language model, and answers respect your global filters and role scope."
        actions={
          turns.length > 0 ? (
            <Button variant="outline" size="sm" onClick={clear}>
              <RotateCcw /> New conversation
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Conversation" className="space-y-4">
            {turns.length === 0 && (
              <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-info-soft text-info">
                  <MessageSquareText className="size-5" aria-hidden />
                </div>
                <p className="text-sm font-medium">Ask a question about workforce, attendance, compliance, salary or invoices</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">Pick an example to start, or type your own. Answers include the interpreted query, key figures, a chart or table and suggested follow-ups.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {EXAMPLE_PROMPTS.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => ask(p)}
                      className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t) => (
              <article key={t.id} className="space-y-3" aria-label={`Question: ${t.question}`}>
                <div className="flex justify-end gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary px-3.5 py-2 text-sm text-secondary-foreground shadow-sm">{t.question}</div>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                    <User className="size-4" />
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-info-soft text-info" aria-hidden>
                    <Bot className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(15,30,60,0.04)]">
                    {t.state === 'pending' && <AnalysingSkeleton />}
                    {t.state === 'error' && <ErrorState error={t.error} onRetry={() => retry(t)} className="py-6" />}
                    {t.state === 'done' && t.answer && <AnswerCard answer={t.answer} onAsk={ask} />}
                  </div>
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </section>

          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {live}
          </div>

          <form onSubmit={onSubmit} className="sticky bottom-2 z-10 rounded-lg border bg-card p-2 shadow-md" role="search" aria-label="Ask a question">
            <div className="flex items-center gap-2">
              <label htmlFor="ask-input" className="sr-only">
                Your question
              </label>
              <Input
                id="ask-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about workforce, attendance, compliance, salary or invoices…"
                autoComplete="off"
                className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                maxLength={300}
              />
              <Button type="submit" variant="secondary" disabled={!input.trim() || busy} aria-label="Ask">
                <Send /> <span className="hidden sm:inline">Ask</span>
              </Button>
            </div>
            <p className="flex items-center gap-1 px-3 pb-0.5 pt-1 text-2xs text-muted-foreground">
              Press <Kbd>Enter</Kbd>
              <CornerDownLeft className="size-3" aria-hidden /> to submit · Answers use the current global filters.
            </p>
          </form>
        </div>

        <div className="space-y-4">
          <Section title="Example questions" description="Select to ask">
            <ul className="space-y-1.5">
              {EXAMPLE_PROMPTS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => ask(p)}
                    disabled={busy}
                    className="w-full rounded-md border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:border-secondary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="How this prototype works">
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
              <li>A deterministic keyword matcher maps your question to one of ~10 predefined analyses.</li>
              <li>Every answer is computed from the same services as the dashboards, within your filters and role scope.</li>
              <li>The interpreted query is shown so you can confirm what was answered.</li>
              <li>In production, a governed semantic layer and audit logging would back this interface. Answers are advisory and never trigger actions.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
