import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import type { CompliancePoint } from '@/services/metrics'
import { fmtNum } from '@/lib/utils'
import { C, ChartBox, axisProps } from './chart-kit'

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: CompliancePoint }>; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]!.payload
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label}</div>
      <div className="grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: C.c1 }} />PF</span>
        <span className="num text-right font-semibold">{p.pfPct.toFixed(2)}%</span>
        <span className="num text-right text-muted-foreground">{fmtNum(p.pfExceptions)} exc.</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="size-2 rounded-sm" style={{ background: C.c2 }} />ESI</span>
        <span className="num text-right font-semibold">{p.esiPct.toFixed(2)}%</span>
        <span className="num text-right text-muted-foreground">{fmtNum(p.esiExceptions)} exc.</span>
      </div>
    </div>
  )
}

/** PF vs ESI compliance % over wage months; tooltip shows exact % and exception counts. */
export function ComplianceTrendChart({ data, height = 240, onSelectMonth, target = 97 }: { data: CompliancePoint[]; height?: number; onSelectMonth?: (m: string) => void; target?: number }) {
  const min = Math.floor(Math.min(...data.flatMap((d) => [d.pfPct, d.esiPct])) - 0.6)
  return (
    <ChartBox height={height} label="PF and ESI compliance percentage trend by wage month">
      <LineChart
        data={data}
        margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
        onClick={(e) => {
          const m = (e?.activePayload?.[0]?.payload as CompliancePoint | undefined)?.month
          if (m && onSelectMonth) onSelectMonth(m)
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis domain={[Math.max(80, min), 100]} tickFormatter={(v: number) => `${v}%`} {...axisProps} width={44} />
        <ReferenceLine y={target} stroke={C.muted} strokeDasharray="4 4" label={{ value: `Target ${target}%`, position: 'insideTopRight', fontSize: 10, fill: C.muted }} />
        <Tooltip content={<TrendTooltip />} />
        <Line type="monotone" dataKey="pfPct" name="PF compliance" stroke={C.c1} strokeWidth={2.25} dot={{ r: 3 }} activeDot={{ r: 5, cursor: onSelectMonth ? 'pointer' : undefined }} />
        <Line type="monotone" dataKey="esiPct" name="ESI compliance" stroke={C.c2} strokeWidth={2.25} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartBox>
  )
}
