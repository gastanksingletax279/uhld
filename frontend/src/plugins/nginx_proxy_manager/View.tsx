import { useEffect, useState } from 'react'
import { api, NpmProxyHost } from '../../api/client'

export function NginxProxyManagerView({ instanceId = 'default' }: { instanceId?: string }) {
  const npmApi = api.nginxProxyManager(instanceId)
  const [hosts, setHosts] = useState<NpmProxyHost[]>([])
  const [error, setError] = useState('')

  async function load() {
    try {
      const data = await npmApi.listHosts()
      setHosts(data.items)
      setError('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load hosts')
    }
  }

  useEffect(() => {
    load().catch(() => undefined)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Nginx Proxy Manager</h2>
        <button className="btn-ghost" onClick={() => load()}>Refresh</button>
      </div>
      {error && <div className="text-danger text-xs">{error}</div>}
      <div className="space-y-2">
        {hosts.map((h) => (
          <div key={h.id} className="card p-3 text-xs flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-100">{h.domain_names?.join(', ') || `Host ${h.id}`}</div>
              <div className="text-muted">Forward: {h.forward_host || '-'}:{h.forward_port || '-'}</div>
            </div>
            <div className="text-muted">{h.enabled ? 'enabled' : 'disabled'}</div>
          </div>
        ))}
        {hosts.length === 0 && <div className="text-xs text-muted">No proxy hosts found.</div>}
      </div>
    </div>
  )
}
