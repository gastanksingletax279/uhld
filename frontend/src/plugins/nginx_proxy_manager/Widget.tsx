import type { PluginSummary } from '../../api/client'

export function NginxProxyManagerWidget({ summary }: { summary: PluginSummary }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Proxy hosts</span>
        <span className="font-mono text-gray-100">{String(summary.proxy_hosts ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Certificates</span>
        <span className="font-mono text-gray-100">{String(summary.certificates ?? 0)}</span>
      </div>
    </div>
  )
}
