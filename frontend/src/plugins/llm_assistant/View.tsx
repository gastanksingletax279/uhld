import { useState, useEffect, useRef } from 'react'
import { api } from '../../api/client'
import type { PluginSummary } from '../../api/client'

// ---------------------------------------------------------------------------
// Lightweight inline markdown renderer (no external dependency)
// ---------------------------------------------------------------------------

interface RenderedNode {
  type: 'text' | 'bold' | 'italic' | 'code' | 'children'
  content?: string
  children?: RenderedNode[]
}

/** Parse inline markdown (bold, italic, inline code) into a list of nodes */
function parseInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = []
  // Pattern: **bold**, *italic*, `code`
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    // text before match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index))
    }
    if (match[2] !== undefined) {
      result.push(<strong key={match.index}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      result.push(<em key={match.index}>{match[3]}</em>)
    } else if (match[4] !== undefined) {
      result.push(
        <code
          key={match.index}
          className="bg-surface-3 px-1 rounded font-mono text-xs"
        >
          {match[4]}
        </code>
      )
    }
    lastIndex = re.lastIndex
  }
  // trailing text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex))
  }
  return result
}

interface MarkdownProps {
  content: string
}

/** Render markdown content with headings, lists, code blocks, and inline styles */
function MarkdownContent({ content }: MarkdownProps) {
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```
    if (line.trimStart().startsWith('```')) {
      const fence = line.trimStart().match(/^(`{3,})/)?.[1] ?? '```'
      const lang = line.trimStart().slice(fence.length).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <div key={i} className="my-3">
          {lang && (
            <div className="bg-surface-4 text-[10px] text-muted font-mono px-3 py-0.5 rounded-t border border-surface-4 border-b-0">
              {lang}
            </div>
          )}
          <pre className={`bg-surface-3 ${lang ? 'rounded-b' : 'rounded'} p-3 font-mono text-xs overflow-x-auto text-gray-100 border border-surface-4`}>
            {codeLines.join('\n')}
          </pre>
        </div>
      )
      i++ // skip closing fence
      continue
    }

    // ATX headings
    const h3 = line.match(/^### (.+)/)
    if (h3) {
      elements.push(
        <h3 key={i} className="text-sm font-bold text-white mt-4 mb-1.5 pb-0.5 border-b border-surface-4">
          {parseInline(h3[1])}
        </h3>
      )
      i++
      continue
    }
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      elements.push(
        <h2 key={i} className="text-base font-bold text-white mt-4 mb-2 pb-1 border-b border-surface-3">
          {parseInline(h2[1])}
        </h2>
      )
      i++
      continue
    }
    const h1 = line.match(/^# (.+)/)
    if (h1) {
      elements.push(
        <h1 key={i} className="text-lg font-bold text-white mt-4 mb-2 pb-1 border-b border-surface-3">
          {parseInline(h1[1])}
        </h1>
      )
      i++
      continue
    }

    // Blockquote
    const bq = line.match(/^> (.+)/)
    if (bq) {
      const lines_: string[] = [bq[1]]
      i++
      while (i < lines.length) {
        const next = lines[i].match(/^> (.+)/)
        if (next) { lines_.push(next[1]); i++ } else break
      }
      elements.push(
        <blockquote key={i} className="border-l-2 border-accent/50 pl-3 my-2 text-sm text-gray-300 italic">
          {lines_.map((l, idx) => <p key={idx}>{parseInline(l)}</p>)}
        </blockquote>
      )
      continue
    }

    // Unordered list — collect all items including indented sub-items
    const ulItem = line.match(/^(\s*)[-*+] (.+)/)
    if (ulItem) {
      const items: { text: string; indent: number }[] = [{ text: ulItem[2], indent: ulItem[1].length }]
      i++
      while (i < lines.length) {
        const next = lines[i].match(/^(\s*)[-*+] (.+)/)
        if (next) { items.push({ text: next[2], indent: next[1].length }); i++ } else break
      }
      elements.push(
        <ul key={i} className="my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm flex gap-2" style={{ paddingLeft: `${item.indent * 0.75}rem` }}>
              <span className="text-accent mt-0.5 flex-shrink-0">•</span>
              <span className="leading-relaxed">{parseInline(item.text)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    const olItem = line.match(/^(\s*)(\d+)\. (.+)/)
    if (olItem) {
      const items: { text: string; num: number; indent: number }[] = [
        { text: olItem[3], num: parseInt(olItem[2]), indent: olItem[1].length }
      ]
      i++
      while (i < lines.length) {
        const next = lines[i].match(/^(\s*)(\d+)\. (.+)/)
        if (next) { items.push({ text: next[3], num: parseInt(next[2]), indent: next[1].length }); i++ } else break
      }
      elements.push(
        <ol key={i} className="my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm flex gap-2" style={{ paddingLeft: `${item.indent * 0.75}rem` }}>
              <span className="text-accent font-mono text-xs mt-0.5 flex-shrink-0 w-4">{item.num}.</span>
              <span className="leading-relaxed">{parseInline(item.text)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-surface-3 my-3" />)
      i++
      continue
    }

    // Markdown table — header row followed by separator row
    if (line.trimStart().startsWith('|')) {
      const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
      const isSeparatorRow = /^\|[\s\-:|]+\|/.test(nextLine.trim())
      if (isSeparatorRow) {
        const parseRow = (row: string) =>
          row.split('|').slice(1, -1).map(c => c.trim())
        const headers = parseRow(line)
        i += 2 // skip header + separator
        const tableRows: string[][] = []
        while (i < lines.length && lines[i].trimStart().startsWith('|')) {
          tableRows.push(parseRow(lines[i]))
          i++
        }
        elements.push(
          <div key={i} className="overflow-x-auto my-3 rounded border border-surface-3">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-surface-3 border-b border-surface-3">
                  {headers.map((h, idx) => (
                    <th key={idx} className="text-left px-3 py-2 font-semibold text-gray-100 whitespace-nowrap">
                      {parseInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, ridx) => (
                  <tr key={ridx} className={`border-t border-surface-3 ${ridx % 2 === 1 ? 'bg-surface-2/40' : ''}`}>
                    {row.map((cell, cidx) => (
                      <td key={cidx} className="px-3 py-1.5 text-gray-200 align-top">
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        continue
      }
    }

    // Blank line — skip (outer space-y handles gaps)
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph — collect consecutive non-special lines into one <p>
    const paraLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3} /) &&
      !lines[i].match(/^(\s*)[-*+] /) &&
      !lines[i].match(/^(\s*)\d+\. /) &&
      !lines[i].match(/^> /) &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('|') &&
      !lines[i].match(/^[-*_]{3,}$/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-gray-200">
        {paraLines.map((pl, idx) => (
          <span key={idx}>{parseInline(pl)}{idx < paraLines.length - 1 ? ' ' : ''}</span>
        ))}
      </p>
    )
  }

  return <div className="space-y-2 min-w-0">{elements}</div>
}

// ---------------------------------------------------------------------------
// Chat message types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Optional display label — shown in the chat bubble instead of the raw content. */
  display?: string
}

// ---------------------------------------------------------------------------
// Main View component
// ---------------------------------------------------------------------------

interface ModelOption {
  id: string
}

export function LLMAssistantView({ instanceId = 'default' }: { instanceId?: string }) {
  const llmApi = api.llmAssistant(instanceId)

  // --- chat state ---
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [error, setError] = useState('')

  // --- quick test panel state ---
  const [quickTestOpen, setQuickTestOpen] = useState(false)
  const [quickTestPrompt, setQuickTestPrompt] = useState("Hello! What can you help me with?")
  const [quickTestModel, setQuickTestModel] = useState('')
  const [quickTestLoading, setQuickTestLoading] = useState(false)
  const [quickTestReply, setQuickTestReply] = useState('')
  const [quickTestError, setQuickTestError] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadModels()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadModels() {
    try {
      const data = await llmApi.listModels()
      setModels(data.models || [])
    } catch (e) {
      console.error('Failed to load models:', e)
    }
  }

  /** Core send: appends user message, gets reply, appends assistant message */
  async function sendMessage(userContent: string, modelOverride?: string, tempOverride?: number, displayLabel?: string) {
    const trimmed = userContent.trim()
    if (!trimmed) return

    const newUserMsg: ChatMessage = { role: 'user', content: trimmed, display: displayLabel }
    const updatedHistory = [...messages, newUserMsg]
    setMessages(updatedHistory)
    setPrompt('')
    setLoading(true)
    setError('')

    try {
      const apiMessages = updatedHistory.map((m) => ({ role: m.role, content: m.content }))
      const data = await llmApi.chat(
        apiMessages,
        modelOverride ?? (selectedModel || undefined),
        tempOverride ?? temperature
      )
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || '(empty response)',
      }
      setMessages([...updatedHistory, assistantMsg])
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Request failed'
      setError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  /** Build a rich infra status prompt and immediately send it */
  async function sendInfraStatus() {
    setLoadingStatus(true)
    setError('')
    try {
      const data = await api.dashboardSummary()
      const plugins: PluginSummary[] = data.plugins ?? []

      // Categorise plugins by type for richer context
      const byCategory: Record<string, PluginSummary[]> = {}
      for (const p of plugins) {
        const cat = (p.category as string | undefined) ?? p.plugin_id
        ;(byCategory[cat] ??= []).push(p)
      }

      const healthy  = plugins.filter(p => p.status === 'ok')
      const degraded = plugins.filter(p => p.status === 'error' || p.status === 'warning')
      const unknown  = plugins.filter(p => p.status !== 'ok' && p.status !== 'error' && p.status !== 'warning')

      // Format each plugin's data concisely, stripping nulls and internal fields
      function fmt(p: PluginSummary): string {
        const { plugin_id, instance_id, ...rest } = p
        const label = instance_id && instance_id !== 'default' ? `${plugin_id} (${instance_id})` : plugin_id
        // Recursively remove null/undefined values to keep the payload tight
        const clean = JSON.parse(JSON.stringify(rest, (_k, v) => v == null ? undefined : v))
        return `### ${label}\n\`\`\`json\n${JSON.stringify(clean, null, 2)}\n\`\`\``
      }

      const sections: string[] = []

      if (degraded.length > 0) {
        sections.push(`## ⚠️ Degraded / Errored Services (${degraded.length})\n${degraded.map(fmt).join('\n\n')}`)
      }
      if (healthy.length > 0) {
        sections.push(`## ✅ Healthy Services (${healthy.length})\n${healthy.map(fmt).join('\n\n')}`)
      }
      if (unknown.length > 0) {
        sections.push(`## ❓ Unknown Status (${unknown.length})\n${unknown.map(fmt).join('\n\n')}`)
      }

      const infraPrompt =
        `You are an expert homelab infrastructure assistant with deep knowledge of self-hosted services, ` +
        `networking, virtualisation, containers, and home media systems.\n\n` +
        `The user is running UHLD (Ultimate Homelab Dashboard), a self-hosted infrastructure dashboard. ` +
        `Below is a real-time snapshot of all their enabled services as of right now.\n\n` +
        `${sections.join('\n\n')}\n\n` +
        `---\n\n` +
        `Using the data above, please provide a **comprehensive infrastructure report** structured as follows:\n\n` +
        `## 1. Overall Health Summary\n` +
        `A 2–3 sentence executive summary. Mention the total number of services monitored, ` +
        `how many are healthy vs degraded, and the general state of the infrastructure.\n\n` +
        `## 2. Issues & Alerts\n` +
        `For every service with status \`error\` or \`warning\`, explain:\n` +
        `- What is wrong (be specific — reference actual values from the data)\n` +
        `- Likely cause (common reasons for this type of failure)\n` +
        `- Recommended remediation steps\n\n` +
        `If no services are degraded, say so and note this is a good sign.\n\n` +
        `## 3. Key Metrics & Observations\n` +
        `Highlight the most interesting or actionable data points across all services. Examples:\n` +
        `- Proxmox: CPU/RAM utilisation, VM/CT counts, any guests that are stopped\n` +
        `- Kubernetes: node health, pod counts, any pods in non-Running state\n` +
        `- Docker: running vs stopped containers\n` +
        `- UniFi: connected client counts, devices, any offline APs or switches\n` +
        `- AdGuard/Pi-hole: query counts, blocking rates, top blocked domains if available\n` +
        `- Plex: active streams, transcoding sessions\n` +
        `- UPS/NUT: battery level, load %, estimated runtime — flag anything below safe thresholds\n` +
        `- HDHomeRun: active tuners, signal quality\n` +
        `- Cloudflare: request/threat counts, any zone issues\n` +
        `- Tailscale: connected devices, any nodes offline\n\n` +
        `## 4. Capacity & Performance Trends\n` +
        `Based on the current metrics, call out any resources approaching limits ` +
        `(high CPU, low disk, high memory, UPS battery below 50%, etc.) and suggest proactive actions.\n\n` +
        `## 5. Recommended Actions\n` +
        `A numbered action list, ordered by priority (critical first). ` +
        `Each item should be specific and actionable — not generic advice. ` +
        `Reference the actual service name and the specific value that prompted the recommendation.\n\n` +
        `Format your entire response in clean Markdown. Be concise but thorough. ` +
        `If a section has nothing to report, briefly say so rather than omitting the section.`

      const pluginCount = plugins.length
      const errCount = plugins.filter(p => p.status === 'error' || p.status === 'warning').length
      const displayLabel = errCount > 0
        ? `📊 Infrastructure Status — ${pluginCount} services monitored, ${errCount} issue${errCount !== 1 ? 's' : ''} detected`
        : `📊 Infrastructure Status — ${pluginCount} services monitored, all healthy`

      await sendMessage(infraPrompt, undefined, undefined, displayLabel)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch infrastructure status')
    } finally {
      setLoadingStatus(false)
    }
  }

  /** Quick Test panel: send to selected model, result stays in panel */
  async function runQuickTest() {
    const trimmed = quickTestPrompt.trim()
    if (!trimmed) return
    setQuickTestLoading(true)
    setQuickTestError('')
    setQuickTestReply('')
    try {
      const data = await llmApi.chat(
        [{ role: 'user', content: trimmed }],
        quickTestModel || undefined,
        0.7
      )
      setQuickTestReply(data.reply || '(empty response)')
    } catch (e: unknown) {
      setQuickTestError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setQuickTestLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void sendMessage(prompt)
    }
  }

  const clearChat = () => {
    setMessages([])
    setError('')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">LLM Assistant</h2>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-sm"
            onClick={() => setQuickTestOpen((v) => !v)}
            title="Toggle quick model test panel"
          >
            🧪 Quick Test
          </button>
          <button
            className="btn-ghost text-sm"
            onClick={() => { void sendInfraStatus() }}
            disabled={loadingStatus || loading}
            title="Fetch current status of all plugins and send as a prompt"
          >
            {loadingStatus ? '⏳ Fetching...' : '📊 Infrastructure Status'}
          </button>
          <button
            className="btn-ghost text-sm"
            onClick={loadModels}
            title="Refresh available models"
          >
            🔄 Refresh Models
          </button>
          {messages.length > 0 && (
            <button
              className="btn-ghost text-sm text-red-400"
              onClick={clearChat}
              title="Clear chat history"
            >
              🗑 Clear
            </button>
          )}
        </div>
      </div>

      {/* Quick Test Panel */}
      {quickTestOpen && (
        <div className="card p-4 space-y-3 border border-yellow-600/30 bg-yellow-900/10">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-yellow-300">🧪 Quick Test</span>
            <span className="text-xs text-muted">
              Test a model without affecting chat history
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Model to test</label>
              <select
                className="input w-full text-sm"
                value={quickTestModel}
                onChange={(e) => setQuickTestModel(e.target.value)}
              >
                <option value="">Use default model from config</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="btn-primary w-full"
                onClick={() => { void runQuickTest() }}
                disabled={quickTestLoading || !quickTestPrompt.trim()}
              >
                {quickTestLoading ? '⏳ Testing...' : '▶ Run Test'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Test prompt</label>
            <textarea
              className="input w-full text-sm font-mono"
              rows={2}
              value={quickTestPrompt}
              onChange={(e) => setQuickTestPrompt(e.target.value)}
              placeholder="Enter a test prompt..."
            />
          </div>
          {quickTestError && (
            <div className="bg-red-900/20 border border-red-700/50 rounded p-2 text-xs text-red-200">
              ❌ {quickTestError}
            </div>
          )}
          {quickTestReply && (
            <div className="bg-surface-2 border border-surface-3 rounded p-3">
              <div className="text-xs text-muted mb-1">Response:</div>
              <MarkdownContent content={quickTestReply} />
            </div>
          )}
        </div>
      )}

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

      {/* Chat History */}
      {messages.length > 0 ? (
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-lg px-4 py-3 max-w-[85%] ${
                  msg.role === 'user'
                    ? 'bg-blue-700/40 border border-blue-600/30 text-sm'
                    : 'bg-surface-2 border border-surface-3'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.display ?? msg.content}</p>
                ) : (
                  <MarkdownContent content={msg.content} />
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-2 border border-surface-3 rounded-lg px-4 py-3 text-sm text-muted animate-pulse">
                ⏳ Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        !loading && !error && (
          <div className="text-center py-12 text-muted text-sm">
            <div className="text-4xl mb-3">🤖</div>
            <p>Ask your LLM assistant a question to get started.</p>
            <p className="text-xs mt-2">
              You can ask about infrastructure status, troubleshooting, or general questions.
            </p>
          </div>
        )
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded p-3 text-sm text-red-200">
          ❌ {error}
        </div>
      )}

      {/* Prompt Input */}
      <div>
        <label className="block text-sm font-medium mb-2">Your Message</label>
        <textarea
          className="input min-h-24 w-full font-mono text-sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about your homelab..."
          disabled={loading}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted">Tip: Cmd/Ctrl + Enter to send</span>
          <button
            className="btn-primary"
            onClick={() => { void sendMessage(prompt) }}
            disabled={loading || !prompt.trim()}
          >
            {loading ? '⏳ Thinking...' : '💬 Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
