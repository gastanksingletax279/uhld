import { useState } from 'react'
import { api } from '../../api/client'

export function LLMAssistantView({ instanceId = 'default' }: { instanceId?: string }) {
  const llmApi = api.llmAssistant(instanceId)
  const [prompt, setPrompt] = useState('How is my homelab doing today?')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)

  async function send() {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const data = await llmApi.chat([{ role: 'user', content: prompt }])
      setReply(data.reply || '(empty response)')
    } catch (e: unknown) {
      setReply(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">LLM Assistant</h2>
      <textarea className="input min-h-24 w-full" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <button className="btn-primary" onClick={send} disabled={loading}>Send</button>
      <pre className="text-xs bg-surface-2 border border-surface-3 rounded p-3 whitespace-pre-wrap">{reply || 'No reply yet.'}</pre>
    </div>
  )
}
