import { useState } from 'react'

interface SchemaProperty {
  type: string
  title?: string
  description?: string
  placeholder?: string
  default?: unknown
  format?: string
  sensitive?: boolean
  enum?: string[]
  minimum?: number
  maximum?: number
}

interface JsonSchema {
  type: string
  properties: Record<string, SchemaProperty>
  required?: string[]
}

interface PluginConfigFormProps {
  schema: JsonSchema
  initialValues?: Record<string, unknown>
  onSubmit: (values: Record<string, unknown>) => void
  onCancel: () => void
  onClear?: () => void
  loading?: boolean
  submitLabel?: string
}

export function PluginConfigForm({
  schema,
  initialValues = {},
  onSubmit,
  onCancel,
  onClear,
  loading = false,
  submitLabel = 'Save',
}: PluginConfigFormProps) {
  // Track which textarea-sensitive fields had a stored value on load
  const storedTextareaFields = new Set(
    Object.entries(schema.properties ?? {})
      .filter(([k, p]) => p.format === 'textarea' && p.sensitive && initialValues[k] === '***')
      .map(([k]) => k)
  )

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {}
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      const raw = initialValues[key] ?? prop.default ?? ''
      // Textarea+sensitive: show empty so '***' doesn't appear as literal text in the textarea
      defaults[key] = (prop.format === 'textarea' && prop.sensitive && raw === '***') ? '' : raw
    }
    return defaults
  })

  function setValue(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleaned: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(values)) {
      const prop = schema.properties[key]
      // Don't submit masked sentinel — backend will keep the existing encrypted value
      if (prop?.sensitive && val === '***') continue
      // Textarea-sensitive left empty = user didn't change it, keep existing encrypted value
      if (prop?.sensitive && prop?.format === 'textarea' && val === '' && storedTextareaFields.has(key)) continue
      cleaned[key] = val === '' ? undefined : val
    }
    onSubmit(cleaned)
  }

  const properties = Object.entries(schema.properties ?? {})
  const required = new Set(schema.required ?? [])

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {properties.map(([key, prop]) => (
        <div key={key}>
          <label className="label" htmlFor={`field-${key}`}>
            {prop.title ?? key}
            {required.has(key) && <span className="text-danger ml-1">*</span>}
          </label>

          {prop.enum ? (
            <select
              id={`field-${key}`}
              className="input"
              value={String(values[key] ?? '')}
              onChange={(e) => setValue(key, e.target.value)}
              required={required.has(key)}
            >
              <option value="">Select…</option>
              {prop.enum.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : prop.type === 'boolean' ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={Boolean(values[key])}
                  onChange={(e) => setValue(key, e.target.checked)}
                />
                <div className="w-9 h-5 bg-surface-4 peer-checked:bg-accent-dim rounded-full transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-xs text-gray-300">{prop.description ?? (values[key] ? 'Enabled' : 'Disabled')}</span>
            </label>
          ) : prop.type === 'integer' || prop.type === 'number' ? (
            <input
              id={`field-${key}`}
              type="number"
              className="input"
              value={String(values[key] ?? '')}
              onChange={(e) => setValue(key, e.target.valueAsNumber)}
              min={prop.minimum}
              max={prop.maximum}
              required={required.has(key)}
            />
          ) : prop.format === 'textarea' ? (
            <textarea
              id={`field-${key}`}
              className="input font-mono text-xs resize-y min-h-[8rem]"
              value={String(values[key] ?? '')}
              onChange={(e) => setValue(key, e.target.value)}
              placeholder={storedTextareaFields.has(key) ? '(stored — paste new content to replace, or leave blank to keep)' : (prop.placeholder ?? prop.description ?? '')}
              required={required.has(key) && !storedTextareaFields.has(key)}
              rows={8}
              spellCheck={false}
            />
          ) : (
            <input
              id={`field-${key}`}
              type={prop.format === 'password' || prop.sensitive ? 'password' : 'text'}
              className="input"
              value={String(values[key] ?? '')}
              onChange={(e) => setValue(key, e.target.value)}
              placeholder={prop.placeholder ?? prop.description ?? ''}
              required={required.has(key)}
              autoComplete={prop.sensitive ? 'new-password' : 'off'}
            />
          )}

          {prop.description && prop.type !== 'boolean' && (
            <p className="mt-1 text-xs text-muted">{prop.description}</p>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between pt-2">
        <div>
          {onClear && (
            <button type="button" onClick={onClear} disabled={loading} className="btn-danger text-xs">
              Clear Settings
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
