import { useState, useEffect } from 'react'
import { api } from '../../api/client'

type Tool = 'ping' | 'traceroute' | 'dns' | 'whois' | 'speedtest'

interface ToolStatus {
  id: string
  available: boolean
}

export function NetworkToolsView({ instanceId = 'default' }: { instanceId?: string }) {
  const networkApi = api.networkTools(instanceId)
  const [query, setQuery] = useState('1.1.1.1')
  const [recordType, setRecordType] = useState('A')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [speedtestHistory, setSpeedtestHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [toolsAvailable, setToolsAvailable] = useState<Record<string, boolean>>({})
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeEventSource, setActiveEventSource] = useState<EventSource | null>(null)

  useEffect(() => {
    loadTools()
    loadSpeedtestHistory()
  }, [])

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (activeEventSource) {
        activeEventSource.close()
      }
    }
  }, [activeEventSource])

  async function loadTools() {
    try {
      const data = await networkApi.tools()
      const available: Record<string, boolean> = {}
      data.tools.forEach((t: ToolStatus) => {
        available[t.id] = t.available
      })
      setToolsAvailable(available)
    } catch (e) {
      console.error(e)
    }
  }

  async function loadSpeedtestHistory() {
    try {
      const hist = await networkApi.speedtestHistory()
      setSpeedtestHistory(hist.items || [])
    } catch (e) {
      console.error(e)
    }
  }

  function runStreaming(tool: 'ping' | 'traceroute') {
    // Close previous stream if any
    if (activeEventSource) {
      activeEventSource.close()
    }

    setLoading(true)
    setIsStreaming(true)
    setOutput('')

    const baseUrl = `/api/plugins/network_tools${instanceId !== 'default' ? `/${instanceId}` : ''}`
    const params = new URLSearchParams()
    
    if (tool === 'ping') {
      params.set('host', query)
      params.set('count', '4')
      params.set('timeout_seconds', '60')
    } else if (tool === 'traceroute') {
      params.set('host', query)
      params.set('max_hops', '20')
      params.set('timeout_seconds', '120')
    }

    // Note: EventSource only supports GET, so we need to use fetch with POST and handle SSE manually
    const url = `${baseUrl}/${tool}/stream`
    
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        tool === 'ping' 
          ? { host: query, count: 4, timeout_seconds: 60 }
          : { host: query, max_hops: 20, timeout_seconds: 120 }
      ),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('No response body')
        }

        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6)
              try {
                const data = JSON.parse(jsonStr)
                if (data.line) {
                  setOutput((prev) => prev + data.line + '\n')
                } else if (data.done) {
                  setLoading(false)
                  setIsStreaming(false)
                  if (data.exit_code !== 0) {
                    setOutput((prev) => prev + `\n❌ Command exited with code ${data.exit_code}`)
                  }
                } else if (data.error) {
                  setOutput((prev) => prev + `\n❌ Error: ${data.error}`)
                  setLoading(false)
                  setIsStreaming(false)
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e)
              }
            }
          }
        }
      })
      .catch((e) => {
        const errMsg = e instanceof Error ? e.message : 'Stream failed'
        setOutput((prev) => (prev || '') + `\n❌ Error: ${errMsg}`)
        setLoading(false)
        setIsStreaming(false)
      })
  }

  async function run(tool: Tool) {
    // Use streaming for ping and traceroute
    if (tool === 'ping' || tool === 'traceroute') {
      runStreaming(tool)
      return
    }

    setLoading(true)
    setOutput('')
    try {
      let data: any
      switch (tool) {
        case 'dns':
          data = await networkApi.dns(query, recordType)
          break
        case 'whois':
          data = await networkApi.whois(query)
          break
        case 'speedtest':
          data = await networkApi.speedtest()
          const hist = await networkApi.speedtestHistory()
          setSpeedtestHistory(hist.items || [])
          
          // Format speedtest result nicely (backend now returns converted Mbps values in history)
          if (data.result && hist.items && hist.items.length > 0) {
            const latest: any = hist.items[0]  // Most recent result
            const formatSpeed = (mbps: number) => mbps >= 1000 ? `${(mbps / 1000).toFixed(2)} Gbps` : `${mbps.toFixed(1)} Mbps`
            
            const download = typeof latest.download === 'number' ? latest.download : 0
            const upload = typeof latest.upload === 'number' ? latest.upload : 0
            const ping = typeof latest.ping === 'number' ? latest.ping : 0
            
            const formattedOutput = [
              '🚀 Speedtest Results',
              '─'.repeat(50),
              '',
              `⬇️  Download: ${formatSpeed(download)}`,
              `⬆️  Upload:   ${formatSpeed(upload)}`,
              `📶 Ping:     ${ping.toFixed(1)} ms`,
              '',
              latest.server?.sponsor ? `📡 Server: ${latest.server.sponsor} (${latest.server.name || ''})` : '',
              latest.client?.isp ? `🌐 ISP: ${latest.client.isp}` : '',
              '',
              latest.timestamp ? `⏰ ${new Date(latest.timestamp).toLocaleString()}` : '',
            ].filter(Boolean).join('\n')
            
            setOutput(formattedOutput)
            return
          }
          break
      }
      setOutput((data.stdout || data.stderr || JSON.stringify(data.result) || 'No output').slice(0, 12000))
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Command failed'
      setOutput(`❌ Error: ${errMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const getToolStatus = (toolId: string) => {
    if (toolsAvailable[toolId] === false) {
      return '⚠️ Not installed'
    }
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Network Diagnostics</h2>
        <button className="text-xs text-muted hover:opacity-70" onClick={loadTools}>
          🔄 Reload Tools
        </button>
      </div>

      {/* Installation Warning */}
      {Object.values(toolsAvailable).some((v) => !v) && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-3 text-xs">
          <div className="font-semibold text-yellow-100 mb-1">⚠️ Missing Commands</div>
          <div className="text-yellow-200/80 mb-2">
            Some tools are not installed in the container. To install:
          </div>
          <pre className="bg-surface-3 p-2 rounded text-[10px] overflow-x-auto">
            {`# For Debian/Ubuntu containers:
docker exec -it uhld apt-get update && apt-get install -y \\
  iputils-ping traceroute dnsutils whois speedtest-cli

# Or add to Dockerfile:
RUN apt-get update && apt-get install -y \\
    iputils-ping traceroute dnsutils whois speedtest-cli`}
          </pre>
        </div>
      )}
      
      {/* Query Input */}
      <div className="space-y-3 p-3 bg-surface-1 rounded border border-surface-3">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Host, domain, or IP address"
            onKeyPress={(e) => e.key === 'Enter' && run('ping')}
          />
        </div>

        {/* Tool Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            className="btn-secondary text-sm relative"
            onClick={() => run('ping')}
            disabled={loading || !query || toolsAvailable.ping === false}
            title={getToolStatus('ping') || undefined}
          >
            🫧 Ping
            {toolsAvailable.ping === false && <span className="text-[10px] ml-1">⚠️</span>}
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => run('traceroute')}
            disabled={loading || !query || toolsAvailable.traceroute === false}
            title={getToolStatus('traceroute') || undefined}
          >
            📍 Traceroute  
            {toolsAvailable.traceroute === false && <span className="text-[10px] ml-1">⚠️</span>}
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={() => run('whois')}
            disabled={loading || !query || toolsAvailable.whois === false}
            title={getToolStatus('whois') || undefined}
          >
            📋 Whois
            {toolsAvailable.whois === false && <span className="text-[10px] ml-1">⚠️</span>}
          </button>
          <div className="sm:col-span-2 flex items-center gap-2">
            <label className="text-xs text-muted">DNS Record:</label>
            <select
              className="input text-xs flex-1"
              value={recordType}
              onChange={(e) => setRecordType(e.target.value)}
            >
              <option>A</option>
              <option>AAAA</option>
              <option>MX</option>
              <option>TXT</option>
              <option>NS</option>
              <option>CNAME</option>
              <option>SOA</option>
              <option>PTR</option>
            </select>
            <button
              className="btn-secondary text-sm"
              onClick={() => run('dns')}
              disabled={loading || !query || toolsAvailable.dns_lookup === false}
              title={getToolStatus('dns_lookup') || undefined}
            >
              🔍 Lookup
              {toolsAvailable.dns_lookup === false && <span className="text-[10px] ml-1">⚠️</span>}
            </button>
          </div>
          <button
            className="btn-primary text-sm"
            onClick={() => run('speedtest')}
            disabled={loading || toolsAvailable.speedtest === false}
            title={getToolStatus('speedtest') || undefined}
          >
            ⚡ Speedtest
            {toolsAvailable.speedtest === false && <span className="text-[10px] ml-1">⚠️</span>}
          </button>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="animate-spin">⏳</div>
          {isStreaming ? 'Streaming output...' : 'Running command...'}
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="space-y-2">
          <div className="text-xs text-muted">Results:</div>
          <pre className="text-xs bg-surface-2 border border-surface-3 rounded p-3 whitespace-pre-wrap overflow-auto max-h-96 font-mono">
            {output}
          </pre>
        </div>
      )}

      {/* Speedtest History */}
      {speedtestHistory.length > 0 && (
        <div className="space-y-2 p-3 bg-surface-1 rounded border border-surface-3">
          <button
            className="text-sm font-semibold flex items-center gap-2 cursor-pointer hover:text-primary-fg"
            onClick={() => setShowHistory(!showHistory)}
          >
            📊 Speedtest History ({speedtestHistory.length})
            <span className="text-xs">{showHistory ? '▼' : '▶'}</span>
          </button>
          {showHistory && (
            <div className="space-y-2 max-h-48 overflow-auto">
              {speedtestHistory.slice(0, 10).map((result: any, i: number) => {
                const download = typeof result.download === 'number' ? result.download : 0
                const upload = typeof result.upload === 'number' ? result.upload : 0
                const ping = typeof result.ping === 'number' ? result.ping : 0
                
                // Format speed: show Gbps if > 1000 Mbps
                const formatSpeed = (mbps: number) => {
                  if (mbps >= 1000) {
                    return `${(mbps / 1000).toFixed(2)} Gbps`
                  }
                  return `${mbps.toFixed(1)} Mbps`
                }
                
                return (
                  <div key={i} className="text-xs bg-surface-2 p-2 rounded">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-muted">{new Date(result.timestamp).toLocaleString()}</span>
                      <div className="font-mono text-right">
                        <div className="text-success">↓ {formatSpeed(download)}</div>
                        <div className="text-accent">↑ {formatSpeed(upload)}</div>
                      </div>
                    </div>
                    <div className="text-muted mt-1">Ping: {ping.toFixed(1)} ms</div>
                    {result.server?.sponsor && (
                      <div className="text-muted/60 text-[10px] mt-0.5 truncate">Server: {result.server.sponsor}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!output && !speedtestHistory.length && (
        <div className="text-xs text-muted text-center py-8">Enter a host or domain and select a tool to get started</div>
      )}
    </div>
  )
}
