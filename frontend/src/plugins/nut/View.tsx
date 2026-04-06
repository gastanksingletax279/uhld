import { useEffect, useState, useMemo } from 'react'
import { api } from '../../api/client'
import type { NUTUpsDevice } from '../../api/client'
import { RefreshCw, Zap, AlertCircle, Loader2, Battery, BatteryCharging, BatteryWarning, Search } from 'lucide-react'
import { getViewState, setViewState } from '../../store/viewStateStore'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

type Tab = 'overview' | 'history' | 'raw'

interface HistorySnapshot {
  ts: number
  upses: Record<string, {
    battery_charge: number | null
    load: number | null
    status: string
  }>
}

interface HistoryChartPoint {
  time: string
  [key: string]: string | number | null
}

const LINE_COLORS = [
  '#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#fb923c',
]

export function NUTView({ instanceId = 'default' }: { instanceId?: string }) {
  const nutApi = api.nut(instanceId)
  const _key = `nut:${instanceId}`

  const [tab, setTabRaw] = useState<Tab>(getViewState(`${_key}:tab`, 'overview') as Tab)
  function setTab(t: Tab) { setViewState(`${_key}:tab`, t); setTabRaw(t) }

  const [devices, setDevices] = useState<NUTUpsDevice[]>([])
  const [history, setHistory] = useState<HistorySnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // For raw vars tab
  const [selectedUps, setSelectedUps] = useState<string>('')
  const [rawSearch, setRawSearch] = useState('')

  // For battery test confirm
  const [testTarget, setTestTarget] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [upsRes, histRes] = await Promise.all([
        nutApi.ups(),
        nutApi.history(),
      ])
      setDevices(upsRes.upses)
      setHistory(histRes.history as HistorySnapshot[])
      if (!selectedUps && upsRes.upses.length > 0) {
        setSelectedUps(upsRes.upses[0].name)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load NUT data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function runBatteryTest(upsname: string) {
    setTestLoading(true)
    setTestMessage(null)
    try {
      await nutApi.testBattery(upsname)
      setTestMessage(`Battery test started on ${upsname}`)
    } catch (e: unknown) {
      setTestMessage(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTestLoading(false)
      setTestTarget(null)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'history', label: 'History' },
    { id: 'raw', label: 'Raw Variables' },
  ]

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-muted" />
          <h2 className="text-base font-semibold text-white">NUT UPS Server</h2>
          {!loading && (
            <span className="badge-ok">{devices.length} UPS{devices.length !== 1 ? 'es' : ''}</span>
          )}
        </div>
        <button onClick={loadData} disabled={loading} className="btn-ghost text-xs gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {testMessage && (
        <div className="flex items-center gap-2 text-sm text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded px-3 py-2">
          <Zap className="w-4 h-4 flex-shrink-0" />
          {testMessage}
          <button onClick={() => setTestMessage(null)} className="ml-auto text-muted hover:text-gray-300">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {tab === 'overview' && (
            <OverviewTab
              devices={devices}
              testTarget={testTarget}
              testLoading={testLoading}
              onTestRequest={(name) => setTestTarget(name)}
              onTestConfirm={(name) => runBatteryTest(name)}
              onTestCancel={() => setTestTarget(null)}
            />
          )}
          {tab === 'history' && (
            <HistoryTab history={history} devices={devices} />
          )}
          {tab === 'raw' && (
            <RawVarsTab
              devices={devices}
              selectedUps={selectedUps}
              onSelectUps={setSelectedUps}
              search={rawSearch}
              onSearch={setRawSearch}
            />
          )}
        </>
      )}
    </div>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({
  devices,
  testTarget,
  testLoading,
  onTestRequest,
  onTestConfirm,
  onTestCancel,
}: {
  devices: NUTUpsDevice[]
  testTarget: string | null
  testLoading: boolean
  onTestRequest: (name: string) => void
  onTestConfirm: (name: string) => void
  onTestCancel: () => void
}) {
  if (devices.length === 0) {
    return <div className="text-sm text-muted text-center py-12">No UPS devices found.</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {devices.map((device) => (
        <UpsCard
          key={device.name}
          device={device}
          isTestTarget={testTarget === device.name}
          testLoading={testLoading}
          onTestRequest={() => onTestRequest(device.name)}
          onTestConfirm={() => onTestConfirm(device.name)}
          onTestCancel={onTestCancel}
        />
      ))}
    </div>
  )
}

function UpsCard({
  device,
  isTestTarget,
  testLoading,
  onTestRequest,
  onTestConfirm,
  onTestCancel,
}: {
  device: NUTUpsDevice
  isTestTarget: boolean
  testLoading: boolean
  onTestRequest: () => void
  onTestConfirm: () => void
  onTestCancel: () => void
}) {
  const { label: statusLabel, color: statusColor } = parseStatus(device.status)
  const charge = device.battery_charge ?? null
  const runtime = device.battery_runtime ?? null

  return (
    <div className="card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <BatteryIcon status={device.status} />
            <span className="text-sm font-semibold text-white truncate">{device.name}</span>
          </div>
          {(device.model || device.manufacturer) && (
            <div className="text-xs text-muted mt-0.5 truncate">
              {[device.manufacturer, device.model].filter(Boolean).join(' — ')}
            </div>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      {/* Battery charge arc + percentage */}
      {charge !== null && (
        <div className="flex items-center gap-3">
          <BatteryGauge pct={charge} />
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Battery</span>
              <span className="font-mono text-gray-200">{charge.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-surface-4 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getBatteryBarColor(charge)}`}
                style={{ width: `${Math.min(charge, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {runtime !== null && (
          <MetricCell label="Runtime" value={formatRuntime(runtime)} />
        )}
        {device.load !== null && device.load !== undefined && (
          <MetricCell label="Load" value={`${device.load.toFixed(0)}%`} />
        )}
        {device.input_voltage !== null && device.input_voltage !== undefined && (
          <MetricCell label="Input V" value={`${device.input_voltage.toFixed(1)} V`} />
        )}
        {device.output_voltage !== null && device.output_voltage !== undefined && (
          <MetricCell label="Output V" value={`${device.output_voltage.toFixed(1)} V`} />
        )}
        {device.battery_voltage !== null && device.battery_voltage !== undefined && (
          <MetricCell label="Batt V" value={`${device.battery_voltage.toFixed(1)} V`} />
        )}
        {device.temperature !== null && device.temperature !== undefined && (
          <MetricCell label="Temp" value={`${device.temperature.toFixed(1)} °C`} />
        )}
      </div>

      {/* Firmware info */}
      {device.firmware && (
        <div className="text-xs text-muted">
          <span>Driver: </span>
          <span className="font-mono text-gray-400">{device.firmware}</span>
        </div>
      )}

      {/* Battery test button / confirm */}
      {isTestTarget ? (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-amber-300 flex-1">Start battery test?</span>
          <button
            onClick={onTestConfirm}
            disabled={testLoading}
            className="px-2 py-1 text-xs rounded bg-amber-900/50 hover:bg-amber-900/70 text-amber-300 border border-amber-700/50"
          >
            {testLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
          </button>
          <button
            onClick={onTestCancel}
            className="px-2 py-1 text-xs rounded bg-surface-3 hover:bg-surface-4 text-muted"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={onTestRequest}
          className="w-full mt-1 px-3 py-1.5 text-xs rounded bg-surface-3 hover:bg-surface-4 text-muted hover:text-gray-300 border border-surface-4 transition-colors"
        >
          Test Battery
        </button>
      )}
    </div>
  )
}

// ── History tab ────────────────────────────────────────────────────────────────

function HistoryTab({ history, devices }: { history: HistorySnapshot[]; devices: NUTUpsDevice[] }) {
  const upsNames = useMemo(() => devices.map((d) => d.name), [devices])

  const chargeData = useMemo<HistoryChartPoint[]>(() => {
    return history.map((snap) => {
      const point: HistoryChartPoint = { time: formatTs(snap.ts) }
      for (const name of upsNames) {
        const entry = snap.upses[name]
        point[name] = entry?.battery_charge ?? null
      }
      return point
    })
  }, [history, upsNames])

  const loadData = useMemo<HistoryChartPoint[]>(() => {
    return history.map((snap) => {
      const point: HistoryChartPoint = { time: formatTs(snap.ts) }
      for (const name of upsNames) {
        const entry = snap.upses[name]
        point[name] = entry?.load ?? null
      }
      return point
    })
  }, [history, upsNames])

  if (history.length === 0) {
    return (
      <div className="text-sm text-muted text-center py-12">
        No history yet — data accumulates as the plugin polls every 30 seconds.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ChartCard title="Battery Charge (%)" data={chargeData} names={upsNames} domain={[0, 100]} />
      <ChartCard title="UPS Load (%)" data={loadData} names={upsNames} domain={[0, 100]} />
    </div>
  )
}

function ChartCard({
  title,
  data,
  names,
  domain,
}: {
  title: string
  data: HistoryChartPoint[]
  names: string[]
  domain: [number, number]
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted font-medium mb-3">{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickLine={false}
            width={32}
          />
          <RechartsTooltip
            contentStyle={{ background: '#1e2330', border: '1px solid #374151', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#9ca3af' }}
          />
          {names.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {names.map((name, i) => (
            <Line
              key={name}
              type="monotone"
              dataKey={name}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Raw Variables tab ──────────────────────────────────────────────────────────

function RawVarsTab({
  devices,
  selectedUps,
  onSelectUps,
  search,
  onSearch,
}: {
  devices: NUTUpsDevice[]
  selectedUps: string
  onSelectUps: (name: string) => void
  search: string
  onSearch: (s: string) => void
}) {
  const device = devices.find((d) => d.name === selectedUps) ?? devices[0]
  const vars = device?.vars ?? {}

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return Object.entries(vars).filter(
      ([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q)
    )
  }, [vars, search])

  if (devices.length === 0) {
    return <div className="text-sm text-muted text-center py-12">No UPS devices found.</div>
  }

  return (
    <div className="space-y-3">
      {/* UPS selector + search */}
      <div className="flex flex-col sm:flex-row gap-2">
        {devices.length > 1 && (
          <select
            value={selectedUps}
            onChange={(e) => onSelectUps(e.target.value)}
            className="input text-sm w-auto"
          >
            {devices.map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            type="text"
            placeholder="Filter variables..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="input pl-8 text-sm w-full"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-4 text-muted">
              <th className="px-3 py-2 text-left font-medium w-1/2">Variable</th>
              <th className="px-3 py-2 text-left font-medium w-1/2">Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-muted">No variables match your filter.</td>
              </tr>
            ) : (
              filtered.map(([key, value]) => (
                <tr key={key} className="border-b border-surface-4/50 hover:bg-surface-3/30 transition-colors">
                  <td className="px-3 py-1.5 font-mono text-blue-300">{key}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-300">{value}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted text-right">
        {filtered.length} / {Object.keys(vars).length} variables
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function BatteryIcon({ status }: { status: string }) {
  if (status.includes('LB')) return <BatteryWarning className="w-4 h-4 text-red-400 flex-shrink-0" />
  if (status.includes('CHRG')) return <BatteryCharging className="w-4 h-4 text-blue-400 flex-shrink-0" />
  return <Battery className="w-4 h-4 text-green-400 flex-shrink-0" />
}

function BatteryGauge({ pct }: { pct: number }) {
  const color = pct <= 20 ? '#ef4444' : pct <= 50 ? '#f59e0b' : '#22c55e'
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const dash = (pct / 100) * circumference

  return (
    <svg width={52} height={52} className="flex-shrink-0">
      {/* Background circle */}
      <circle cx={26} cy={26} r={radius} fill="none" stroke="#374151" strokeWidth={5} />
      {/* Progress arc */}
      <circle
        cx={26}
        cy={26}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circumference - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
      />
      <text x={26} y={30} textAnchor="middle" fontSize={11} fill="#e5e7eb" fontFamily="monospace">
        {pct.toFixed(0)}%
      </text>
    </svg>
  )
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-3 rounded p-2">
      <div className="text-muted mb-0.5 text-[10px]">{label}</div>
      <div className="font-mono text-gray-200 text-xs">{value}</div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" />
      Loading…
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseStatus(status: string): { label: string; color: string } {
  if (status.includes('LB')) return { label: 'Low Battery', color: 'text-red-300 bg-red-900/30 border border-red-800/40' }
  if (status.includes('OB')) return { label: 'On Battery', color: 'text-amber-300 bg-amber-900/30 border border-amber-800/40' }
  if (status.includes('CHRG')) return { label: 'Charging', color: 'text-blue-300 bg-blue-900/30 border border-blue-800/40' }
  if (status.includes('DISCHRG')) return { label: 'Discharging', color: 'text-orange-300 bg-orange-900/30 border border-orange-800/40' }
  if (status.includes('OL')) return { label: 'Online', color: 'text-green-300 bg-green-900/30 border border-green-800/40' }
  if (status === 'error') return { label: 'Error', color: 'text-red-300 bg-red-900/30 border border-red-800/40' }
  return { label: status || 'Unknown', color: 'text-gray-400 bg-surface-3 border border-surface-4' }
}

function getBatteryBarColor(pct: number): string {
  if (pct <= 20) return 'bg-red-500'
  if (pct <= 50) return 'bg-amber-500'
  return 'bg-green-500'
}

function formatRuntime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}

function formatTs(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
