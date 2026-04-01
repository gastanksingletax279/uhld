import { useState, useEffect } from 'react'
import { api } from '../../api/client'

interface ModelOption {
  id: string
}

export function LLMAssistantView({ instanceId = 'default' }: { instanceId?: string }) {
  const llmApi = api.llmAssistant(instanceId)
  const [prompt, setPrompt] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [error, setError] = useState('')

  useEffect(() => {
    loadModels()
  }, [])

  async function loadModels() {
    try {
      const data = await llmApi.listModels()
      setModels(data.models || [])
    } catch (e) {
      console.error('Failed to load models:', e)
    }
  }

  async function send() {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const messages = [{ role: 'user', content: prompt }]
      const data = await llmApi.chat(messages, selectedModel || undefined, temperature)
      setReply(data.reply || '(empty response)')
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Request failed'
      setError(errMsg)
      setReply('')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      send()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">LLM Assistant</h2>
        <button 
          className="btn-ghost text-sm" 
          onClick={loadModels}
          title="Refresh available models"
        >
          🔄 Refresh Models
        </button>
      </div>

      {/* Configuration Bar */}
      <div className="card p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Model</label>
            <select 
              className="input w-full text-sm" 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">Use default model from config</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">
              Temperature: {temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted mt-1">
              <span>Precise</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Input */}
      <div>
        <label className="block text-sm font-medium mb-2">Your Message</label>
        <textarea 
          className="input min-h-32 w-full font-mono text-sm" 
          value={prompt} 
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask me anything about your homelab..."
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted">Tip: Cmd/Ctrl + Enter to send</span>
          <button 
            className="btn-primary" 
            onClick={send} 
            disabled={loading || !prompt.trim()}
          >
            {loading ? '⏳ Thinking...' : '💬 Send'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-200">
          ❌ {error}
        </div>
      )}

      {/* Response Display */}
      {reply && (
        <div>
          <label className="block text-sm font-medium mb-2">Response</label>
          <div className="bg-surface-2 border border-surface-3 rounded p-4">
            <pre className="text-sm whitespace-pre-wrap font-sans text-gray-100">{reply}</pre>
          </div>
        </div>
      )}

      {!loading && !reply && !error && (
        <div className="text-center py-12 text-muted text-sm">
          <div className="text-4xl mb-3">🤖</div>
          <p>Ask your LLM assistant a question to get started.</p>
          <p className="text-xs mt-2">You can ask about infrastructure status, troubleshooting, or general questions.</p>
        </div>
      )}
    </div>
  )
}
