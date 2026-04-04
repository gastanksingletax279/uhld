import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, RefreshCw, Search, Square, Trash2, Wifi } from 'lucide-react'
import { api, TcpdumpCaptureItem, TcpdumpCaptureOptions } from '../../api/client'

// ── Preset definitions ────────────────────────────────────────────────────────

interface Preset {
  label: string
  filter: string
}
interface PresetGroup {
  group: string
  items: Preset[]
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    group: 'Web',
    items: [
      { label: 'HTTP', filter: 'tcp port 80' },
      { label: 'HTTPS', filter: 'tcp port 443' },
      { label: 'HTTP/3', filter: 'udp port 443' },
      { label: 'HTTP+S', filter: 'tcp port 80 or tcp port 443' },
    ],
  },
  {
    group: 'DNS / DHCP',
    items: [
      { label: 'DNS', filter: 'udp port 53' },
      { label: 'DNS TCP', filter: 'tcp port 53' },
      { label: 'DHCP', filter: 'udp port 67 or udp port 68' },
      { label: 'DHCPv6', filter: 'udp port 546 or udp port 547' },
      { label: 'mDNS', filter: 'udp port 5353' },
    ],
  },
  {
    group: 'Infrastructure',
    items: [
      { label: 'ICMP', filter: 'icmp' },
      { label: 'ICMPv6', filter: 'icmp6' },
      { label: 'ARP', filter: 'arp' },
      { label: 'NTP', filter: 'udp port 123' },
      { label: 'SNMP', filter: 'udp port 161 or udp port 162' },
      { label: 'Syslog', filter: 'udp port 514' },
      { label: 'LLDP', filter: 'ether proto 0x88cc' },
      { label: 'STP', filter: 'ether dst 01:80:c2:00:00:00' },
      { label: 'VRRP', filter: 'ip proto 112' },
    ],
  },
  {
    group: 'Remote Access',
    items: [
      { label: 'SSH', filter: 'tcp port 22' },
      { label: 'RDP', filter: 'tcp port 3389' },
      { label: 'VNC', filter: 'tcp port 5900 or tcp port 5901' },
      { label: 'Telnet', filter: 'tcp port 23' },
      { label: 'WinRM', filter: 'tcp port 5985 or tcp port 5986' },
    ],
  },
  {
    group: 'Routing',
    items: [
      { label: 'BGP', filter: 'tcp port 179' },
      { label: 'OSPF', filter: 'ip proto 89' },
      { label: 'RIP', filter: 'udp port 520' },
      { label: 'ISIS', filter: 'isis' },
    ],
  },
  {
    group: 'Mail / File',
    items: [
      { label: 'SMTP', filter: 'tcp port 25 or tcp port 587 or tcp port 465' },
      { label: 'IMAP', filter: 'tcp port 143 or tcp port 993' },
      { label: 'FTP', filter: 'tcp port 20 or tcp port 21' },
      { label: 'SMB', filter: 'tcp port 445 or tcp port 139' },
      { label: 'NFS', filter: 'tcp port 2049 or udp port 2049' },
    ],
  },
  {
    group: 'Utilities',
    items: [
      { label: 'Broadcast', filter: 'ether broadcast' },
      { label: 'Multicast', filter: 'ether multicast' },
      { label: 'RADIUS', filter: 'udp port 1812 or udp port 1813' },
      { label: 'TACACS+', filter: 'tcp port 49' },
      { label: 'Sflow', filter: 'udp port 6343' },
      { label: 'NetFlow', filter: 'udp port 2055' },
      { label: '¬ SSH', filter: 'not tcp port 22' },
      { label: 'IPv6 only', filter: 'ip6' },
    ],
  },
]

// ── Command preview builder ───────────────────────────────────────────────────

function buildPreview(opts: TcpdumpCaptureOptions, sshUser: string, sshHost: string): string {
  const parts = ['tcpdump', '-nn', '-l', '-s', String(opts.snaplen ?? 0)]

  if (opts.ascii_output) parts.push('-A')
  else if (opts.hex_ascii_output) parts.push('-X')

  const v = opts.verbosity ?? 0
  if (v >= 3) parts.push('-vvv')
  else if (v === 2) parts.push('-vv')
  else if (v === 1) parts.push('-v')

  if (opts.print_ethernet) parts.push('-e')

  const ts = ({ none: '-t', unix: '-tt', delta: '-ttt', diff: '-tttt' } as Record<string, string>)[opts.timestamp_format ?? '']
  if (ts) parts.push(ts)

  parts.push('-i', opts.interface)

  if (opts.packet_count != null) parts.push('-c', String(opts.packet_count))
  if (opts.filter) parts.push(opts.filter)

  const cmd = parts.join(' ')
  if (opts.remote && sshHost) return `ssh ${sshUser}@${sshHost} "${cmd}"`
  return cmd
}

// ── Main View ─────────────────────────────────────────────────────────────────

export function RemoteTcpdumpView({ instanceId = 'default' }: { instanceId?: string }) {
  const tcpdumpApi = api.remoteTcpdump(instanceId)

  // SSH info
  const [sshHost, setSshHost] = useState<string | null>(null)
  const [sshUser, setSshUser] = useState<string | null>(null)

  // Capture settings
  const [remote, setRemote] = useState(true)
  const [iface, setIface] = useState('any')
  const [interfaces, setInterfaces] = useState<string[]>([])
  const [ifaceLoading, setIfaceLoading] = useState(false)
  const [ifaceError, setIfaceError] = useState<string | null>(null)

  // Termination
  const [terminationMode, setTerminationMode] = useState<'packets' | 'duration'>('packets')
  const [packetCount, setPacketCount] = useState(200)
  const [durationSecs, setDurationSecs] = useState(30)

  // Filter
  const [filterMode, setFilterMode] = useState<'simple' | 'advanced'>('simple')
  const [protocol, setProtocol] = useState('')
  const [filterHost, setFilterHost] = useState('')
  const [filterPort, setFilterPort] = useState('')
  const [filterMac, setFilterMac] = useState('')
  const [advancedFilter, setAdvancedFilter] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  // Output options
  const [showOutputOpts, setShowOutputOpts] = useState(false)
  const [snaplen, setSnaplen] = useState(0)
  const [asciiOutput, setAsciiOutput] = useState(false)
  const [hexAsciiOutput, setHexAsciiOutput] = useState(false)
  const [verbosity, setVerbosity] = useState(0)
  const [printEthernet, setPrintEthernet] = useState(false)
  const [timestampFormat, setTimestampFormat] = useState('default')

  // Live output
  const [lines, setLines] = useState<{ text: string; stderr?: boolean }[]>([])
  const [outputSearch, setOutputSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)

  // History
  const [captures, setCaptures] = useState<TcpdumpCaptureItem[]>([])
  const [selectedCapture, setSelectedCapture] = useState<TcpdumpCaptureItem | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const outputRef = useRef<HTMLPreElement | null>(null)

  // ── Derived filter string ─────────────────────────────────────────────────

  const computedFilter = (() => {
    if (filterMode === 'advanced') return advancedFilter
    const parts: string[] = []
    if (protocol) parts.push(protocol)
    if (filterHost) parts.push(`host ${filterHost}`)
    if (filterPort) parts.push(`port ${filterPort}`)
    if (filterMac) parts.push(`ether host ${filterMac}`)
    return parts.join(' and ')
  })()

  const captureOptions: TcpdumpCaptureOptions = {
    interface: iface,
    packet_count: terminationMode === 'packets' ? packetCount : null,
    duration_seconds: terminationMode === 'duration' ? durationSecs : null,
    filter: computedFilter,
    remote,
    snaplen,
    ascii_output: asciiOutput,
    hex_ascii_output: !asciiOutput && hexAsciiOutput,
    verbosity,
    print_ethernet: printEthernet,
    timestamp_format: timestampFormat,
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    tcpdumpApi.info().then((d) => { setSshHost(d.ssh_host); setSshUser(d.ssh_user) }).catch(() => undefined)
    tcpdumpApi.list().then((d) => setCaptures(d.items)).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [lines])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function fetchInterfaces() {
    setIfaceLoading(true)
    setIfaceError(null)
    try {
      const data = await tcpdumpApi.interfaces(remote)
      setInterfaces(data.interfaces)
      if (iface !== 'any' && !data.interfaces.includes(iface)) setIface('any')
    } catch (e: unknown) {
      setIfaceError(e instanceof Error ? e.message : 'Failed to fetch interfaces')
    } finally {
      setIfaceLoading(false)
    }
  }

  function stopCapture() {
    abortRef.current?.abort()
  }

  async function runStreaming() {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setIsStreaming(true)
    setLines([])

    try {
      const resp = await fetch(tcpdumpApi.streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captureOptions),
        signal: ctrl.signal,
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          try {
            const data = JSON.parse(part.slice(6))
            if ('line' in data) {
              setLines((prev) => [...prev, { text: data.line as string, stderr: data.stderr === true }])
            } else if (data.done) {
              setLoading(false)
              setIsStreaming(false)
              await tcpdumpApi.list().then((d) => setCaptures(d.items)).catch(() => undefined)
            } else if (data.error) {
              setLines((prev) => [...prev, { text: `❌ ${data.error as string}`, stderr: true }])
              setLoading(false)
              setIsStreaming(false)
            }
          } catch { /* ignore malformed */ }
        }
      }
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== 'AbortError') {
        setLines((prev) => [...prev, { text: `❌ ${e instanceof Error ? e.message : 'Stream failed'}`, stderr: true }])
      }
    } finally {
      setLoading(false)
      setIsStreaming(false)
    }
  }

  async function downloadPcap() {
    setLoading(true)
    try {
      const resp = await fetch(tcpdumpApi.pcapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captureOptions),
      })
      if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`)
      const blob = await resp.blob()
      const disposition = resp.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? `capture-${iface}-${Date.now()}.pcap`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setLines([{ text: `❌ PCAP failed: ${e instanceof Error ? e.message : 'Error'}`, stderr: true }])
    } finally {
      setLoading(false)
    }
  }

  async function viewCapture(id: string) {
    try { setSelectedCapture(await tcpdumpApi.get(id)) } catch { /* ignore */ }
  }

  async function handleDelete(id: string) {
    try {
      await tcpdumpApi.deleteCapture(id)
      setCaptures((prev) => prev.filter((c) => c.id !== id))
    } catch { /* ignore */ } finally {
      setConfirmDeleteId(null)
    }
  }

  function applyPreset(filter: string) {
    setAdvancedFilter(filter)
    setFilterMode('advanced')
    setShowPresets(false)
  }

  // ── Filtered output lines ─────────────────────────────────────────────────

  const visibleLines = outputSearch
    ? lines.filter((l) => l.text.toLowerCase().includes(outputSearch.toLowerCase()))
    : lines

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Remote Packet Capture</h2>
        {remote && sshHost && (
          <div className="flex items-center gap-1.5 text-xs text-accent bg-accent/10 border border-accent/20 rounded px-2 py-1">
            <Wifi className="w-3 h-3" />
            <span className="font-mono">{sshUser ? `${sshUser}@` : ''}{sshHost}</span>
          </div>
        )}
      </div>

      {/* Capture Configuration */}
      <div className="card p-4 space-y-4">

        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted w-16 flex-shrink-0">Mode</span>
          <button
            className={`text-xs px-3 py-1.5 rounded transition-colors ${remote ? 'bg-accent text-black font-medium' : 'bg-surface-3 text-gray-300 hover:bg-surface-4'}`}
            onClick={() => { setRemote(true); setInterfaces([]) }}
          >
            Remote (SSH)
          </button>
          <button
            className={`text-xs px-3 py-1.5 rounded transition-colors ${!remote ? 'bg-accent text-black font-medium' : 'bg-surface-3 text-gray-300 hover:bg-surface-4'}`}
            onClick={() => { setRemote(false); setInterfaces([]) }}
          >
            Local
          </button>
        </div>

        {/* Interface + Termination row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted block mb-1">Interface</label>
            <div className="flex gap-1">
              {interfaces.length > 0 ? (
                <select className="input flex-1 text-sm" value={iface} onChange={(e) => setIface(e.target.value)}>
                  <option value="any">any</option>
                  {interfaces.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              ) : (
                <input className="input flex-1 text-sm" value={iface} onChange={(e) => setIface(e.target.value)} placeholder="any, eth0, wlan0…" />
              )}
              <button
                className="p-1.5 rounded bg-surface-3 hover:bg-surface-4 text-muted hover:text-white transition-colors flex-shrink-0"
                onClick={fetchInterfaces} disabled={ifaceLoading} title="Fetch interfaces from system"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${ifaceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {ifaceError && <div className="text-xs text-danger mt-1">{ifaceError}</div>}
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Stop after</label>
            <div className="flex gap-1 items-center">
              <button
                className={`text-xs px-2.5 py-1.5 rounded transition-colors flex-shrink-0 ${terminationMode === 'packets' ? 'bg-accent text-black font-medium' : 'bg-surface-3 text-gray-300'}`}
                onClick={() => setTerminationMode('packets')}
              >
                Packets
              </button>
              <button
                className={`text-xs px-2.5 py-1.5 rounded transition-colors flex-shrink-0 ${terminationMode === 'duration' ? 'bg-accent text-black font-medium' : 'bg-surface-3 text-gray-300'}`}
                onClick={() => setTerminationMode('duration')}
              >
                Duration
              </button>
              {terminationMode === 'packets' ? (
                <input type="number" className="input flex-1 text-sm" value={packetCount} min={1} max={50000}
                  onChange={(e) => setPacketCount(Number(e.target.value))} />
              ) : (
                <div className="flex items-center gap-1 flex-1">
                  <input type="number" className="input flex-1 text-sm" value={durationSecs} min={1} max={3600}
                    onChange={(e) => setDurationSecs(Number(e.target.value))} />
                  <span className="text-xs text-muted flex-shrink-0">sec</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted w-16 flex-shrink-0">Filter</span>
            <button
              className={`text-xs px-2.5 py-1 rounded transition-colors ${filterMode === 'simple' ? 'bg-surface-4 text-white' : 'bg-surface-3 text-gray-400 hover:text-white'}`}
              onClick={() => setFilterMode('simple')}
            >Simple</button>
            <button
              className={`text-xs px-2.5 py-1 rounded transition-colors ${filterMode === 'advanced' ? 'bg-surface-4 text-white' : 'bg-surface-3 text-gray-400 hover:text-white'}`}
              onClick={() => setFilterMode('advanced')}
            >Advanced (BPF)</button>
            <button
              className="text-xs px-2.5 py-1 rounded bg-surface-3 text-gray-400 hover:text-white transition-colors ml-auto flex items-center gap-1"
              onClick={() => setShowPresets((p) => !p)}
            >
              Presets {showPresets ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          </div>

          {filterMode === 'simple' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted block mb-1">Protocol</label>
                <select className="input w-full text-sm" value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                  <option value="">Any</option>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                  <option value="icmp6">ICMPv6</option>
                  <option value="arp">ARP</option>
                  <option value="ip6">IPv6</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Host / IP</label>
                <input className="input w-full text-sm" value={filterHost} onChange={(e) => setFilterHost(e.target.value)} placeholder="192.168.1.1" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Port</label>
                <input type="number" className="input w-full text-sm" value={filterPort} onChange={(e) => setFilterPort(e.target.value)} placeholder="443" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">MAC Address</label>
                <input className="input w-full text-sm font-mono" value={filterMac} onChange={(e) => setFilterMac(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" />
              </div>
            </div>
          )}

          {filterMode === 'advanced' && (
            <div>
              <input
                className="input w-full font-mono text-sm"
                value={advancedFilter}
                onChange={(e) => setAdvancedFilter(e.target.value)}
                placeholder="tcp and port 443 and host 10.0.0.1"
              />
              <p className="text-[10px] text-muted mt-1">
                Standard pcap filter syntax. Examples:&nbsp;
                <code className="bg-surface-3 px-1 rounded">not port 22</code>&nbsp;
                <code className="bg-surface-3 px-1 rounded">ether host aa:bb:cc:dd:ee:ff</code>&nbsp;
                <code className="bg-surface-3 px-1 rounded">vlan 100</code>
              </p>
            </div>
          )}

          {computedFilter && (
            <div className="bg-surface-3 rounded px-3 py-1.5 text-xs font-mono flex items-center gap-2">
              <span className="text-muted flex-shrink-0">Filter:</span>
              <span className="text-green-300 truncate">{computedFilter}</span>
            </div>
          )}

          {/* Presets panel */}
          {showPresets && (
            <div className="border border-surface-4 rounded p-3 space-y-2 bg-surface-2">
              {PRESET_GROUPS.map((group) => (
                <div key={group.group}>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{group.group}</div>
                  <div className="flex flex-wrap gap-1">
                    {group.items.map((p) => (
                      <button
                        key={p.label}
                        className="text-xs px-2 py-0.5 rounded bg-surface-3 hover:bg-accent/20 hover:text-accent border border-surface-4 hover:border-accent/30 transition-colors"
                        onClick={() => applyPreset(p.filter)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Output options (collapsible) */}
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
            onClick={() => setShowOutputOpts((p) => !p)}
          >
            {showOutputOpts ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Output Options
          </button>
          {showOutputOpts && (
            <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs pl-4">
              <div>
                <label className="text-muted block mb-1">Snaplen (-s)</label>
                <div className="flex items-center gap-2">
                  <input type="number" className="input w-24 text-sm" value={snaplen} min={0} max={65535}
                    onChange={(e) => setSnaplen(Number(e.target.value))} />
                  <span className="text-muted">0 = max</span>
                </div>
              </div>
              <div>
                <label className="text-muted block mb-1">Payload Display</label>
                <select className="input w-full text-sm" value={asciiOutput ? 'ascii' : hexAsciiOutput ? 'hexascii' : 'none'}
                  onChange={(e) => { setAsciiOutput(e.target.value === 'ascii'); setHexAsciiOutput(e.target.value === 'hexascii') }}>
                  <option value="none">None (default)</option>
                  <option value="ascii">ASCII (-A)</option>
                  <option value="hexascii">Hex+ASCII (-X)</option>
                </select>
              </div>
              <div>
                <label className="text-muted block mb-1">Verbosity</label>
                <select className="input w-full text-sm" value={verbosity} onChange={(e) => setVerbosity(Number(e.target.value))}>
                  <option value={0}>Default</option>
                  <option value={1}>-v (verbose)</option>
                  <option value={2}>-vv (more verbose)</option>
                  <option value={3}>-vvv (maximum)</option>
                </select>
              </div>
              <div>
                <label className="text-muted block mb-1">Timestamps</label>
                <select className="input w-full text-sm" value={timestampFormat} onChange={(e) => setTimestampFormat(e.target.value)}>
                  <option value="default">Default (human)</option>
                  <option value="none">None (-t)</option>
                  <option value="unix">Unix epoch (-tt)</option>
                  <option value="delta">Delta since prev (-ttt)</option>
                  <option value="diff">Wall + delta (-tttt)</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <input type="checkbox" id="eth-hdr" checked={printEthernet} onChange={(e) => setPrintEthernet(e.target.checked)} className="w-3.5 h-3.5" />
                <label htmlFor="eth-hdr" className="text-muted cursor-pointer">Print Ethernet headers (-e)</label>
              </div>
            </div>
          )}
        </div>

        {/* Command preview */}
        <div className="bg-surface-3 rounded px-3 py-2 font-mono text-[11px] text-gray-300 break-all border border-surface-4">
          <span className="text-muted text-[10px] mr-2">CMD</span>
          {buildPreview(captureOptions, sshUser ?? '', sshHost ?? '')}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {isStreaming ? (
            <button className="btn-danger text-sm flex-1 flex items-center justify-center gap-2" onClick={stopCapture}>
              <Square className="w-3.5 h-3.5" /> Stop Capture
            </button>
          ) : (
            <button className="btn-primary text-sm flex-1" onClick={runStreaming} disabled={loading}>
              {loading && !isStreaming ? '⏳ Working…' : '▶ Start Capture (Live)'}
            </button>
          )}
          <button
            className="btn-secondary text-sm flex items-center gap-1.5 px-4"
            onClick={downloadPcap} disabled={loading || isStreaming}
            title="Runs a fresh capture and downloads as .pcap (open in Wireshark)"
          >
            <Download className="w-3.5 h-3.5" /> Download PCAP
          </button>
        </div>
      </div>

      {/* Live output */}
      {lines.length > 0 && (
        <div className="card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-surface-3 rounded px-2 py-1">
              <Search className="w-3 h-3 text-muted flex-shrink-0" />
              <input
                className="bg-transparent text-xs outline-none flex-1 placeholder-muted"
                placeholder="Search output…"
                value={outputSearch}
                onChange={(e) => setOutputSearch(e.target.value)}
              />
            </div>
            <span className="text-xs text-muted flex-shrink-0">
              {isStreaming ? '🔴 live' : `${lines.filter((l) => !l.stderr).length} lines`}
              {outputSearch && ` · ${visibleLines.length} match`}
            </span>
            <button className="text-xs text-muted hover:text-white" onClick={() => { setLines([]); setOutputSearch('') }}>Clear</button>
          </div>
          <pre ref={outputRef} className="text-xs bg-surface-2 rounded p-2 whitespace-pre-wrap overflow-auto max-h-[480px] font-mono leading-5">
            {visibleLines.map((l, i) => (
              <span key={i} className={l.stderr ? 'text-yellow-400/80' : 'text-green-300'}>
                {outputSearch ? (
                  l.text.split(new RegExp(`(${outputSearch})`, 'gi')).map((part, j) =>
                    part.toLowerCase() === outputSearch.toLowerCase()
                      ? <mark key={j} className="bg-yellow-500/30 text-yellow-200 rounded-sm">{part}</mark>
                      : part
                  )
                ) : l.text}
                {'\n'}
              </span>
            ))}
            {isStreaming && <span className="animate-pulse text-muted">▌</span>}
          </pre>
        </div>
      )}

      {/* Capture History */}
      {captures.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">Capture History ({captures.length})</h3>
          <div className="space-y-1">
            {captures.map((cap) => (
              <div key={cap.id} className="flex items-center gap-3 p-3 card hover:bg-surface-3 transition-colors">
                <div className="flex-1 cursor-pointer min-w-0" onClick={() => viewCapture(cap.id)}>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="text-muted">{new Date(cap.created_at).toLocaleString()}</span>
                    <span className="font-mono text-accent">{cap.interface || 'any'}</span>
                    {cap.mode === 'remote'
                      ? <span className="badge bg-orange-900/30 text-orange-300">REMOTE</span>
                      : <span className="badge bg-surface-4 text-muted">LOCAL</span>}
                    {cap.exit_code === 0
                      ? <span className="badge badge-ok">OK</span>
                      : <span className="badge badge-error">exit {cap.exit_code}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
                    {cap.packet_count != null && <span>{cap.packet_count} pkts</span>}
                    {cap.duration_seconds != null && <span>{cap.duration_seconds}s</span>}
                    {cap.filter && <span className="font-mono truncate max-w-[300px]">filter: {cap.filter}</span>}
                  </div>
                </div>
                {confirmDeleteId === cap.id ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs text-danger">Delete?</span>
                    <button className="text-xs px-2 py-0.5 rounded bg-danger text-white hover:bg-danger/80" onClick={() => handleDelete(cap.id)}>Yes</button>
                    <button className="text-xs px-2 py-0.5 rounded bg-surface-3 hover:bg-surface-4" onClick={() => setConfirmDeleteId(null)}>No</button>
                  </div>
                ) : (
                  <button
                    className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(cap.id) }}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture Detail Modal */}
      {selectedCapture && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelectedCapture(null)}>
          <div className="bg-surface-2 border border-surface-3 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-surface-2 border-b border-surface-3 p-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Capture Details</h3>
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary text-xs flex items-center gap-1"
                  onClick={() => {
                    const blob = new Blob([selectedCapture.stdout || ''], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `capture-${selectedCapture.id}.txt`; a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download className="w-3 h-3" /> .txt
                </button>
                <button className="text-muted hover:text-white text-lg leading-none" onClick={() => setSelectedCapture(null)}>✕</button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                {[
                  ['Time', new Date(selectedCapture.created_at).toLocaleString()],
                  ['Mode', selectedCapture.mode || 'local'],
                  ['Interface', selectedCapture.interface || 'any'],
                  ['Packets', String(selectedCapture.packet_count ?? 'N/A')],
                  ['Duration', selectedCapture.duration_seconds ? `${selectedCapture.duration_seconds}s` : '—'],
                  ['Exit code', String(selectedCapture.exit_code ?? '?')],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface-3 rounded p-2">
                    <div className="text-muted">{k}</div>
                    <div className="text-white mt-0.5">{v}</div>
                  </div>
                ))}
                {selectedCapture.filter && (
                  <div className="bg-surface-3 rounded p-2 col-span-full">
                    <div className="text-muted">Filter</div>
                    <div className="text-white mt-0.5 font-mono">{selectedCapture.filter}</div>
                  </div>
                )}
                {selectedCapture.command && (
                  <div className="bg-surface-3 rounded p-2 col-span-full">
                    <div className="text-muted">Command</div>
                    <div className="text-white mt-0.5 font-mono text-[10px] break-all">{selectedCapture.command}</div>
                  </div>
                )}
              </div>
              {selectedCapture.stdout && (
                <div>
                  <div className="text-xs text-muted mb-1">Output</div>
                  <pre className="text-xs bg-surface-3 border border-surface-4 rounded p-3 whitespace-pre-wrap overflow-auto max-h-96 font-mono text-green-300">
                    {selectedCapture.stdout}
                  </pre>
                </div>
              )}
              {selectedCapture.stderr && (
                <div>
                  <div className="text-xs text-yellow-400/80 mb-1">Stderr</div>
                  <pre className="text-xs bg-yellow-900/10 border border-yellow-700/30 rounded p-3 whitespace-pre-wrap overflow-auto max-h-48 font-mono text-yellow-300/80">
                    {selectedCapture.stderr}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
