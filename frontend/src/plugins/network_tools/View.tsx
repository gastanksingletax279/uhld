import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import {
  Activity, AlertCircle, ChevronDown, ChevronUp, Clock,
  Download, Globe, Loader2, Radio, Search, Shield,
  Square, Upload, Wifi, Zap, Server, Lock, TerminalSquare,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTool =
  | 'ping' | 'traceroute' | 'mtr'
  | 'http' | 'port_check' | 'ssl'
  | 'dns' | 'dig' | 'whois'
  | 'iperf3' | 'speedtest' | 'wol'
  | null

interface SpeedResult {
  download: number; upload: number; ping: number; timestamp: string
  server?: { sponsor?: string; name?: string }
  client?: { isp?: string }
}

function fmtSpeed(mbps: number) {
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} Gbps` : `${mbps.toFixed(1)} Mbps`
}

// ── Streaming helper ──────────────────────────────────────────────────────────

function streamPost(
  url: string, body: Record<string, unknown>,
  onLine: (l: string) => void, onDone: (code: number) => void, onError: (m: string) => void,
): () => void {
  const ctrl = new AbortController()
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    .then(async (resp) => {
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.line !== undefined) onLine(ev.line)
            else if (ev.done) onDone(ev.exit_code ?? 0)
            else if (ev.error) onError(ev.error)
          } catch { /* ignore */ }
        }
      }
    })
    .catch((e) => { if (e?.name !== 'AbortError') onError(e instanceof Error ? e.message : 'Stream failed') })
  return () => ctrl.abort()
}

// ── Tool button ───────────────────────────────────────────────────────────────

function ToolBtn({ icon: Icon, label, active, disabled, unavailable, loading, onClick }: {
  icon: React.ElementType; label: string; active: boolean
  disabled: boolean; unavailable: boolean; loading: boolean; onClick: () => void
}) {
  return (
    <button
      className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border
        ${active ? 'bg-blue-600 border-blue-500 text-white'
          : unavailable ? 'bg-surface-2 border-surface-3 text-muted opacity-50 cursor-not-allowed'
          : 'bg-surface-2 border-surface-3 text-gray-300 hover:bg-surface-3 hover:text-white'}
        ${disabled && !active ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={(disabled || unavailable) && !active}
      onClick={onClick}
      title={unavailable ? 'Not installed in container' : undefined}
    >
      {active && loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
      {unavailable && <AlertCircle className="w-3 h-3 text-amber-400 ml-auto" />}
    </button>
  )
}

// ── Output panel (right column) ───────────────────────────────────────────────

function OutputPanel({ label, output, loading, onStop, speedHistory, showHistory, setShowHistory }: {
  label: string; output: string; loading: boolean; onStop: () => void
  speedHistory: SpeedResult[]; showHistory: boolean; setShowHistory: (v: boolean) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [output])

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Terminal output */}
      <div className="card overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-surface-3 bg-surface-2 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <TerminalSquare className="w-3.5 h-3.5 text-muted" />
            <span className="font-medium text-gray-300 truncate max-w-[200px]" title={label}>
              {label || 'Output'}
            </span>
            {loading && (
              <span className="flex items-center gap-1 text-green-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                live
              </span>
            )}
          </div>
          {loading && (
            <button
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-800/60 hover:bg-red-900/20 transition-colors"
              onClick={onStop}
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>
        <pre className="text-xs font-mono p-3 whitespace-pre-wrap overflow-auto flex-1 leading-relaxed">
          {output
            ? output
            : <span className="text-muted">Run a tool to see results here…</span>}
          <div ref={bottomRef} />
        </pre>
      </div>

      {/* Speedtest history */}
      {speedHistory.length > 0 && (
        <div className="card p-3 space-y-2 shrink-0">
          <button
            className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-300 w-full"
            onClick={() => setShowHistory(!showHistory)}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium">Speedtest History</span>
            <span className="text-[10px] text-muted">({speedHistory.length})</span>
            <span className="ml-auto">{showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</span>
          </button>
          {showHistory && (
            <div className="space-y-1 max-h-48 overflow-auto">
              {speedHistory.slice(0, 15).map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-surface-2 rounded px-2 py-1.5">
                  <span className="text-muted shrink-0 text-[10px]">{new Date(r.timestamp).toLocaleString()}</span>
                  <span className="flex items-center gap-0.5 text-green-400 ml-auto"><Download className="w-3 h-3" />{fmtSpeed(r.download)}</span>
                  <span className="flex items-center gap-0.5 text-blue-400"><Upload className="w-3 h-3" />{fmtSpeed(r.upload)}</span>
                  <span className="flex items-center gap-0.5 text-amber-400"><Wifi className="w-3 h-3" />{r.ping.toFixed(0)}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function NetworkToolsView({ instanceId = 'default' }: { instanceId?: string }) {
  const networkApi = api.networkTools(instanceId)
  const baseUrl = instanceId === 'default' ? '/api/plugins/network_tools' : `/api/plugins/network_tools/${instanceId}`

  const [toolsAvailable, setToolsAvailable] = useState<Record<string, boolean>>({})
  const [host, setHost]             = useState('1.1.1.1')
  const [recordType, setRecordType] = useState('A')
  const [portNum, setPortNum]       = useState('443')
  const [iperfServer,   setIperfServer]   = useState('')
  const [iperfPort,     setIperfPort]     = useState('5201')
  const [iperfDuration, setIperfDuration] = useState('10')
  const [iperfReverse,  setIperfReverse]  = useState(false)
  const [wolMac,        setWolMac]        = useState('')
  const [wolBroadcast,  setWolBroadcast]  = useState('255.255.255.255')

  const [activeTool,  setActiveTool]  = useState<ActiveTool>(null)
  const [output,      setOutput]      = useState('')
  const [outputLabel, setOutputLabel] = useState('')
  const [loading,     setLoading]     = useState(false)
  const stopRef = useRef<(() => void) | null>(null)

  const [speedHistory, setSpeedHistory] = useState<SpeedResult[]>([])
  const [showHistory,  setShowHistory]  = useState(false)
  const [speedRunning, setSpeedRunning] = useState(false)

  useEffect(() => {
    networkApi.tools().then((d) => {
      const m: Record<string, boolean> = {}
      d.tools.forEach((t) => { m[t.id] = t.available })
      setToolsAvailable(m)
    }).catch(() => {})
    networkApi.speedtestHistory()
      .then((d) => setSpeedHistory((d.items ?? []) as unknown as SpeedResult[]))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId])

  useEffect(() => () => { stopRef.current?.() }, [])

  const anyLoading = loading || speedRunning
  const h = host.trim()
  const p = parseInt(portNum) || 443

  function stopStream() {
    stopRef.current?.(); stopRef.current = null
    setLoading(false); setActiveTool(null)
  }

  function runStream(tool: 'ping' | 'traceroute' | 'mtr' | 'iperf3', url: string, body: Record<string, unknown>, label: string) {
    stopStream()
    setActiveTool(tool); setLoading(true); setOutput(''); setOutputLabel(label)
    stopRef.current = streamPost(url, body,
      (line) => setOutput((p) => p ? p + '\n' + line : line),
      (code) => { setLoading(false); setActiveTool(null); if (code !== 0) setOutput((p) => p + `\n\n[exited with code ${code}]`) },
      (err)  => { setLoading(false); setActiveTool(null); setOutput((p) => p + `\n\n[error: ${err}]`) },
    )
  }

  async function runInstant(tool: ActiveTool, label: string, fn: () => Promise<{ stdout: string }>) {
    stopStream()
    setActiveTool(tool); setLoading(true); setOutput(''); setOutputLabel(label)
    try {
      const res = await fn()
      setOutput((res.stdout || 'No output').trim())
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : 'Command failed'}`)
    } finally {
      setLoading(false); setActiveTool(null)
    }
  }

  const hostTools = [
    { id: 'http',       label: 'HTTP Check', icon: Globe,
      run: () => runInstant('http', `HTTP — ${h}`, () => networkApi.httpCheck(h)) },
    { id: 'mtr',        label: 'MTR',        icon: Activity,
      run: () => runStream('mtr', `${baseUrl}/mtr/stream`, { host: h, cycles: 10, timeout_seconds: 60 }, `MTR — ${h}`) },
    { id: 'ping',       label: 'Ping',       icon: Radio,
      run: () => runStream('ping', `${baseUrl}/ping/stream`, { host: h, count: 4, timeout_seconds: 60 }, `Ping — ${h}`) },
    { id: 'traceroute', label: 'Traceroute', icon: Server,
      run: () => runStream('traceroute', `${baseUrl}/traceroute/stream`, { host: h, max_hops: 20, timeout_seconds: 120 }, `Traceroute — ${h}`) },
    { id: 'whois',      label: 'Whois',      icon: Search,
      run: () => runInstant('whois', `Whois — ${h}`, () => networkApi.whois(h)) },
  ]

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)] min-h-[500px]">

      {/* ── Left column: tool panels ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 w-80 shrink-0 overflow-y-auto pr-1">

        {/* Host Tools */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Host Tools</h3>
          <input
            className="input w-full font-mono text-sm"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="IP address or hostname"
            onKeyDown={(e) => { if (e.key === 'Enter' && !anyLoading && h) hostTools.find((t) => t.id === 'ping')?.run() }}
          />
          <div className="flex flex-col gap-1.5">
            {hostTools.map(({ id, label, icon, run }) => (
              <ToolBtn key={id} icon={icon} label={label}
                active={activeTool === id} loading={loading}
                disabled={anyLoading && activeTool !== id}
                unavailable={toolsAvailable[id] === false}
                onClick={() => {
                  if (activeTool === id && loading) { stopStream(); return }
                  if (!h) return
                  run()
                }}
              />
            ))}
          </div>
        </div>

        {/* Port & SSL */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Port & SSL</h3>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-sm" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host" />
            <input className="input w-20 font-mono text-sm" value={portNum} onChange={(e) => setPortNum(e.target.value)} placeholder="Port" type="number" min={1} max={65535} />
          </div>
          <div className="flex flex-col gap-1.5">
            <ToolBtn icon={Shield} label="Port Check"
              active={activeTool === 'port_check'} loading={loading}
              disabled={anyLoading && activeTool !== 'port_check'} unavailable={false}
              onClick={() => { if (!h || !p) return; runInstant('port_check', `Port Check — ${h}:${p}`, () => networkApi.portCheck(h, p)) }}
            />
            <ToolBtn icon={Lock} label="SSL Certificate"
              active={activeTool === 'ssl'} loading={loading}
              disabled={anyLoading && activeTool !== 'ssl'} unavailable={false}
              onClick={() => { if (!h) return; runInstant('ssl', `SSL — ${h}:${p}`, () => networkApi.sslCheck(h, p)) }}
            />
          </div>
        </div>

        {/* DNS / Dig */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">DNS / Dig</h3>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-sm" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Domain or IP" />
            <select className="input w-20 text-sm" value={recordType} onChange={(e) => setRecordType(e.target.value)}>
              {['A','AAAA','MX','TXT','NS','CNAME','SOA','PTR'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <ToolBtn icon={Search} label="Lookup"
              active={activeTool === 'dns'} loading={loading}
              disabled={anyLoading && activeTool !== 'dns'} unavailable={toolsAvailable.dns_lookup === false}
              onClick={() => { if (!h) return; runInstant('dns', `DNS ${recordType} — ${h}`, async () => { const r = await networkApi.dns(h, recordType); return { stdout: r.stdout || r.stderr || 'No results' } }) }}
            />
            <ToolBtn icon={TerminalSquare} label="Full Dig"
              active={activeTool === 'dig'} loading={loading}
              disabled={anyLoading && activeTool !== 'dig'} unavailable={toolsAvailable.dig === false}
              onClick={() => { if (!h) return; runInstant('dig', `Dig ${recordType} — ${h}`, async () => { const r = await networkApi.dig(h, recordType); return { stdout: r.stdout || r.stderr || 'No results' } }) }}
            />
          </div>
        </div>

        {/* iPerf3 */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">iPerf3</h3>
          <input className="input w-full font-mono text-sm" value={iperfServer} onChange={(e) => setIperfServer(e.target.value)} placeholder="iPerf3 server host or IP" />
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-sm" value={iperfPort} onChange={(e) => setIperfPort(e.target.value)} placeholder="Port" type="number" min={1} max={65535} />
            <input className="input w-16 font-mono text-sm" value={iperfDuration} onChange={(e) => setIperfDuration(e.target.value)} placeholder="Sec" type="number" min={1} max={60} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input type="checkbox" className="rounded" checked={iperfReverse} onChange={(e) => setIperfReverse(e.target.checked)} />
            Reverse (server→client)
          </label>
          <ToolBtn icon={Zap} label={activeTool === 'iperf3' && loading ? 'Running…' : 'Run iPerf3'}
            active={activeTool === 'iperf3'} loading={loading}
            disabled={anyLoading && activeTool !== 'iperf3'} unavailable={toolsAvailable.iperf3 === false}
            onClick={() => {
              if (activeTool === 'iperf3' && loading) { stopStream(); return }
              const s = iperfServer.trim(); if (!s) return
              runStream('iperf3', `${baseUrl}/iperf3/stream`,
                { host: s, port: parseInt(iperfPort)||5201, duration: parseInt(iperfDuration)||10, reverse: iperfReverse, timeout_seconds: 90 },
                `iPerf3 — ${s}`)
            }}
          />
        </div>

        {/* Wake-on-LAN */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Wake-on-LAN</h3>
          <input className="input w-full font-mono text-sm" value={wolMac} onChange={(e) => setWolMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
          <input className="input w-full font-mono text-sm" value={wolBroadcast} onChange={(e) => setWolBroadcast(e.target.value)} placeholder="Broadcast IP" />
          <ToolBtn icon={Wifi} label="Send Magic Packet"
            active={activeTool === 'wol'} loading={loading}
            disabled={anyLoading && activeTool !== 'wol'} unavailable={false}
            onClick={() => { const mac = wolMac.trim(); if (!mac) return; runInstant('wol', 'Wake-on-LAN', () => networkApi.wol(mac, wolBroadcast.trim()||'255.255.255.255')) }}
          />
        </div>

        {/* Speedtest */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-200">Speedtest</h3>
          <button
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium border w-full justify-center transition-colors
              ${speedRunning ? 'bg-blue-600 border-blue-500 text-white'
                : toolsAvailable.speedtest === false ? 'bg-surface-2 border-surface-3 text-muted opacity-50 cursor-not-allowed'
                : 'bg-surface-2 border-surface-3 text-gray-300 hover:bg-surface-3 hover:text-white'}
              ${anyLoading && !speedRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={(anyLoading && !speedRunning) || toolsAvailable.speedtest === false}
            onClick={async () => {
              if (anyLoading) return
              setSpeedRunning(true); setActiveTool('speedtest'); setOutput(''); setOutputLabel('Speedtest')
              try {
                await networkApi.speedtest()
                const hist = await networkApi.speedtestHistory()
                const items = (hist.items ?? []) as unknown as SpeedResult[]
                setSpeedHistory(items)
                if (items.length > 0) {
                  const r = items[0]
                  const lines = [`Download : ${fmtSpeed(r.download)}`, `Upload   : ${fmtSpeed(r.upload)}`, `Ping     : ${r.ping.toFixed(1)} ms`]
                  if (r.server?.sponsor) lines.push(`Server   : ${r.server.sponsor}${r.server.name ? ` (${r.server.name})` : ''}`)
                  if (r.client?.isp)     lines.push(`ISP      : ${r.client.isp}`)
                  setOutput(lines.join('\n'))
                }
              } catch (e) {
                setOutput(`Error: ${e instanceof Error ? e.message : 'Speedtest failed'}`)
              } finally {
                setSpeedRunning(false); setActiveTool(null)
              }
            }}
          >
            {speedRunning ? <><Loader2 className="w-4 h-4 animate-spin" />Running…</> : <><Zap className="w-4 h-4" />Run Speedtest</>}
            {toolsAvailable.speedtest === false && <AlertCircle className="w-3 h-3 text-amber-400 ml-auto" />}
          </button>
          {speedRunning && <p className="text-xs text-muted text-center">This takes 30–60 seconds…</p>}
        </div>

        {/* Missing tools */}
        {Object.entries(toolsAvailable).some(([, v]) => !v) && (
          <div className="flex items-start gap-2 text-xs bg-amber-900/20 border border-amber-800/40 rounded p-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-amber-300 font-medium">Not installed: </span>
              <span className="text-amber-200/70">{Object.entries(toolsAvailable).filter(([, v]) => !v).map(([k]) => k).join(', ')}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Right column: output ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <OutputPanel
          label={outputLabel}
          output={output}
          loading={loading || speedRunning}
          onStop={stopStream}
          speedHistory={speedHistory}
          showHistory={showHistory}
          setShowHistory={setShowHistory}
        />
      </div>

    </div>
  )
}
