import { useEffect, useState } from 'react'
import { api, TcpdumpCaptureItem } from '../../api/client'

export function RemoteTcpdumpView({ instanceId = 'default' }: { instanceId?: string }) {
  const tcpdumpApi = api.remoteTcpdump(instanceId)
  const [iface, setIface] = useState('any')
  const [packetCount, setPacketCount] = useState(50)
  const [filter, setFilter] = useState('')
  const [filterMode, setFilterMode] = useState<'simple' | 'advanced'>('simple')
  const [protocol, setProtocol] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [captures, setCaptures] = useState<TcpdumpCaptureItem[]>([])
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCapture, setSelectedCapture] = useState<TcpdumpCaptureItem | null>(null)

  async function load() {
    const data = await tcpdumpApi.list()
    setCaptures(data.items)
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (filterMode === 'simple') {
      const parts: string[] = []
      if (protocol) parts.push(protocol)
      if (host) parts.push(`host ${host}`)
      if (port) parts.push(`port ${port}`)
      setFilter(parts.join(' and '))
    }
  }, [filterMode, protocol, host, port])

  async function run() {
    setLoading(true)
    setOutput('')
    try {
      const data = await tcpdumpApi.run({ 
        interface: iface, 
        packet_count: packetCount, 
        filter: filter,
        timeout_seconds: 30 
      })
      setOutput((data.stdout || data.stderr || '').slice(0, 20000))
      await load()
    } catch (e: unknown) {
      setOutput(`❌ Error: ${e instanceof Error ? e.message : 'Capture failed'}`)
    } finally {
      setLoading(false)
    }
  }

  async function viewCapture(id: string) {
    try {
      const data = await tcpdumpApi.get(id)
      setSelectedCapture(data)
    } catch (e) {
      console.error(e)
    }
  }

  function applyPreset(preset: string) {
    switch (preset) {
      case 'http':
        setProtocol('tcp')
        setPort('80')
        return
      case 'https':
        setProtocol('tcp')
        setPort('443')
        return
      case 'dns':
        setProtocol('udp')
        setPort('53')
        return
      case 'ssh':
        setProtocol('tcp')
        setPort('22')
        return
      case 'icmp':
        setProtocol('icmp')
        setPort('')
        return
      case 'all':
        setProtocol('')
        setHost('')
        setPort('')
        return
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Remote Packet Capture (tcpdump)</h2>

      {/* Capture Controls */}
      <div className="p-4 bg-surface-1 rounded border border-surface-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted">Interface</label>
            <input 
              className="input mt-1 w-full" 
              value={iface} 
              onChange={(e) => setIface(e.target.value)} 
              placeholder="any, eth0, wlan0..." 
            />
          </div>
          <div>
            <label className="text-xs text-muted">Packet Count</label>
            <input 
              type="number" 
              className="input mt-1 w-full" 
              value={packetCount} 
              onChange={(e) => setPacketCount(Number(e.target.value))} 
              min="1"
              max="1000"
            />
          </div>
        </div>

        {/* Filter Mode Toggle */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Filter Mode:</label>
          <button
            className={`text-xs px-3 py-1 rounded ${
              filterMode === 'simple' ? 'bg-primary text-white' : 'bg-surface-2 hover:bg-surface-3'
            }`}
            onClick={() => setFilterMode('simple')}
          >
            🎯 Simple
          </button>
          <button
            className={`text-xs px-3 py-1 rounded ${
              filterMode === 'advanced' ? 'bg-primary text-white' : 'bg-surface-2 hover:bg-surface-3'
            }`}
            onClick={() => setFilterMode('advanced')}
          >
            ⚙️ Advanced
          </button>
        </div>

        {/* Simple Filter Builder */}
        {filterMode === 'simple' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted">Protocol</label>
                <select 
                  className="input mt-1 w-full text-sm" 
                  value={protocol} 
                  onChange={(e) => setProtocol(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="icmp">ICMP</option>
                  <option value="arp">ARP</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted">Host (IP or hostname)</label>
                <input 
                  className="input mt-1 w-full" 
                  value={host} 
                  onChange={(e) => setHost(e.target.value)} 
                  placeholder="192.168.1.1" 
                />
              </div>
              <div>
                <label className="text-xs text-muted">Port</label>
                <input 
                  type="number" 
                  className="input mt-1 w-full" 
                  value={port} 
                  onChange={(e) => setPort(e.target.value)} 
                  placeholder="80" 
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted">Presets:</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {['all', 'http', 'https', 'dns', 'ssh', 'icmp'].map((preset) => (
                  <button
                    key={preset}
                    className="text-xs px-2 py-1 bg-surface-2 hover:bg-surface-3 rounded"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Advanced Filter */}
        {filterMode === 'advanced' && (
          <div>
            <label className="text-xs text-muted">tcpdump Filter Syntax</label>
            <input 
              className="input mt-1 w-full font-mono text-xs" 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)} 
              placeholder="tcp and port 80 and host 192.168.1.1" 
            />
            <div className="text-[10px] text-muted mt-1">
              Examples: <code className="bg-surface-2 px-1 rounded">tcp port 443</code>, <code className="bg-surface-2 px-1 rounded">icmp</code>, <code className="bg-surface-2 px-1 rounded">not port 22</code>
            </div>
          </div>
        )}

        {/* Generated Filter Preview */}
        {filter && (
          <div className="bg-surface-2 border border-surface-3 rounded p-2 text-xs font-mono">
            <span className="text-muted">Filter: </span>
            <span className="text-green-300">{filter || '(none)'}</span>
          </div>
        )}

        <button 
          className="btn-primary text-sm w-full" 
          onClick={run} 
          disabled={loading}
        >
          {loading ? '⏳ Capturing...' : '▶️ Start Capture'}
        </button>
      </div>

      {/* Output */}
      {output && (
        <div className="space-y-2">
          <div className="text-xs text-muted">Live Output:</div>
          <pre className="text-xs bg-surface-2 border border-surface-3 rounded p-3 whitespace-pre-wrap overflow-auto max-h-96 font-mono">
            {output}
          </pre>
        </div>
      )}

      {/* Capture History */}
      {captures.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">📋 Capture History ({captures.length})</h3>
          <div className="space-y-1">
            {captures.slice(0, 10).map((cap) => (
              <div
                key={cap.id}
                className="flex items-center justify-between gap-3 p-3 bg-surface-2 rounded hover:bg-surface-3 transition-colors cursor-pointer"
                onClick={() => viewCapture(cap.id)}
              >
                <div className="flex-1">
                  <div className="text-sm flex items-center gap-2">
                    <span className="text-muted">{new Date(cap.created_at).toLocaleString()}</span>
                    <span className="text-blue-300">{cap.interface || 'any'}</span>
                    {cap.mode === 'remote' && <span className="text-xs bg-orange-900/30 px-1.5 py-0.5 rounded">REMOTE</span>}
                  </div>
                  {cap.filter && (
                    <div className="text-xs text-muted font-mono mt-1">Filter: {cap.filter}</div>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {cap.packet_count || '?'} packets
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capture Detail Modal */}
      {selectedCapture && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCapture(null)}
        >
          <div
            className="bg-surface-2 border border-surface-3 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface-2 border-b border-surface-3 p-4 flex items-center justify-between z-10">
              <h3 className="text-base font-semibold">📦 Capture Details</h3>
              <button
                className="text-muted hover:text-white text-xl leading-none"
                onClick={() => setSelectedCapture(null)}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-surface-3 rounded p-2">
                  <span className="text-muted">Timestamp:</span>
                  <div className="text-white mt-1">{new Date(selectedCapture.created_at).toLocaleString()}</div>
                </div>
                <div className="bg-surface-3 rounded p-2">
                  <span className="text-muted">Mode:</span>
                  <div className="text-white mt-1">{selectedCapture.mode || 'local'}</div>
                </div>
                <div className="bg-surface-3 rounded p-2">
                  <span className="text-muted">Interface:</span>
                  <div className="text-white mt-1">{selectedCapture.interface || 'any'}</div>
                </div>
                <div className="bg-surface-3 rounded p-2">
                  <span className="text-muted">Packets:</span>
                  <div className="text-white mt-1">{selectedCapture.packet_count || 'N/A'}</div>
                </div>
                {selectedCapture.filter && (
                  <div className="bg-surface-3 rounded p-2 col-span-2">
                    <span className="text-muted">Filter:</span>
                    <div className="text-white mt-1 font-mono">{selectedCapture.filter}</div>
                  </div>
                )}
                {selectedCapture.command && (
                  <div className="bg-surface-3 rounded p-2 col-span-2">
                    <span className="text-muted">Command:</span>
                    <div className="text-white mt-1 font-mono text-[10px]">{selectedCapture.command}</div>
                  </div>
                )}
              </div>

              {/* Output */}
              {selectedCapture.stdout && (
                <div>
                  <div className="text-xs text-muted mb-1">Captured Output:</div>
                  <pre className="text-xs bg-surface-3 border border-surface-4 rounded p-3 whitespace-pre-wrap overflow-auto max-h-96 font-mono">
                    {selectedCapture.stdout}
                  </pre>
                </div>
              )}

              {selectedCapture.stderr && (
                <div>
                  <div className="text-xs text-red-300 mb-1">Errors/Warnings:</div>
                  <pre className="text-xs bg-red-900/20 border border-red-700/50 rounded p-3 whitespace-pre-wrap overflow-auto max-h-48 font-mono">
                    {selectedCapture.stderr}
                  </pre>
                </div>
              )}

              {/* Download Button (future enhancement) */}
              <div className="flex justify-end gap-2">
                <button
                  className="btn-secondary text-sm"
                  onClick={() => {
                    const blob = new Blob([selectedCapture.stdout || ''], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `capture-${selectedCapture.id}.txt`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  💾 Download Output
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
