import type { PluginSummary } from '../../api/client'

export function LLMAssistantWidget({ summary }: { summary: PluginSummary }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Model</span>
        <span className="font-mono text-gray-100 truncate max-w-[140px] text-right">{String(summary.model ?? 'n/a')}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Chats</span>
        <span className="font-mono text-gray-100">{String(summary.chat_requests ?? 0)}</span>
      </div>
    </div>
  )
}
