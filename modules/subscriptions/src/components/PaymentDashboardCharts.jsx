import { GATEWAY_CHART_COLORS } from '@nidus-admin/shared'

const GATEWAY_SERIES = [
  { key: 'paynow', label: 'PayNow', color: GATEWAY_CHART_COLORS.paynow },
  { key: 'flutterwave', label: 'Flutterwave', color: GATEWAY_CHART_COLORS.flutterwave },
  { key: 'paddle', label: 'Paddle', color: GATEWAY_CHART_COLORS.paddle },
]

function formatChartValue(value, metric) {
  if (metric === 'revenue') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  }
  if (metric === 'count') return String(Math.round(value))
  return `${Number(value).toFixed(1)}%`
}

function formatPeriodLabel(period) {
  if (!period) return ''
  const date = new Date(period)
  if (Number.isNaN(date.getTime())) return String(period).slice(5, 10)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function StackedGatewayBarChart({ data, metric = 'revenue' }) {
  if (!data?.length) return null

  const totals = data.map((row) =>
    GATEWAY_SERIES.reduce((sum, series) => sum + Number(row[series.key] || 0), 0),
  )
  const maxTotal = Math.max(...totals, 1)
  const chartHeight = 200
  const gap = 8
  const barWidth = Math.max(12, Math.min(36, Math.floor((640 - gap * (data.length - 1)) / data.length)))

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <svg
          viewBox={`0 0 ${data.length * (barWidth + gap)} ${chartHeight + 28}`}
          className="min-w-full text-gray-400"
          role="img"
          aria-label="Gateway performance over time"
        >
          {data.map((row, index) => {
            const x = index * (barWidth + gap)
            let yOffset = chartHeight
            const total = totals[index]
            return (
              <g key={row.period || index} transform={`translate(${x}, 0)`}>
                {GATEWAY_SERIES.map((series) => {
                  const value = Number(row[series.key] || 0)
                  const height = maxTotal > 0 ? (value / maxTotal) * chartHeight : 0
                  yOffset -= height
                  return (
                    <rect
                      key={series.key}
                      x={0}
                      y={yOffset}
                      width={barWidth}
                      height={Math.max(height, 0)}
                      fill={series.color}
                      rx={2}
                    >
                      <title>
                        {`${formatPeriodLabel(row.period)} · ${series.label}: ${formatChartValue(value, metric)}`}
                      </title>
                    </rect>
                  )
                })}
                <text
                  x={barWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {formatPeriodLabel(row.period)}
                </text>
                <title>{`${formatPeriodLabel(row.period)} total: ${formatChartValue(total, metric)}`}</title>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        {GATEWAY_SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function polarToCartesian(cx, cy, radius, angle) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`
}

export function PaymentMethodDonutChart({ data, colors, onSelectMethod }) {
  if (!data?.length) return null

  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const radius = 88
  let cursor = 0

  return (
    <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[220px] w-[220px] shrink-0" role="img" aria-label="Payment method breakdown">
        {total <= 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="#1f2937" stroke="#374151" />
        ) : (
          data.map((item, index) => {
            const value = Number(item.value || 0)
            const sweep = (value / total) * 360
            const start = cursor
            const end = cursor + sweep
            cursor = end
            if (value <= 0) return null
            return (
              <path
                key={item.methodType || item.name || index}
                d={describeArc(cx, cy, radius, start, end)}
                fill={colors[index % colors.length]}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => onSelectMethod?.(item.methodType || null)}
              >
                <title>{`${item.name}: ${value} (${((value / total) * 100).toFixed(1)}%)`}</title>
              </path>
            )
          })
        )}
        <circle cx={cx} cy={cy} r={48} fill="#111827" />
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="18" fill="#f3f4f6" fontWeight="600">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#9ca3af">
          payments
        </text>
      </svg>
      <ul className="min-w-0 space-y-2 text-sm text-gray-300">
        {data.map((item, index) => (
          <li key={item.methodType || item.name || index}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-800/60"
              onClick={() => onSelectMethod?.(item.methodType || null)}
            >
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-gray-500">
                {item.value}
                {total > 0 ? ` (${((Number(item.value || 0) / total) * 100).toFixed(0)}%)` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
