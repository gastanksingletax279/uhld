import { FormEvent, useState } from 'react'
import { X } from 'lucide-react'

// ── ConfirmModal ───────────────────────────────────────────────────────────────
// Shown for destructive action confirmations — replaces window.confirm().

export interface ConfirmModalState {
  title: string
  message?: string
  confirmLabel?: string
  /** Tailwind bg+hover classes, e.g. 'bg-danger hover:bg-danger/80' */
  confirmClass?: string
  onConfirm: () => void
}

export function ConfirmModal({
  modal,
  onCancel,
}: {
  modal: ConfirmModalState
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}
    >
      <div
        className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-semibold text-white leading-tight pr-4">{modal.title}</h3>
          <button onClick={onCancel} className="text-muted hover:text-gray-300 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {modal.message && (
          <p className="text-xs text-muted mb-5 leading-relaxed">{modal.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-xs" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`text-xs px-3 py-1.5 rounded font-medium text-white transition-colors ${modal.confirmClass ?? 'bg-accent hover:bg-accent/80'}`}
            onClick={modal.onConfirm}
          >
            {modal.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── InputModal ─────────────────────────────────────────────────────────────────
// Replaces window.prompt() — modal with a text/password input field.

export interface InputModalState {
  title: string
  message?: string
  inputLabel?: string
  inputType?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  confirmClass?: string
  onConfirm: (value: string) => void
}

export function InputModal({
  modal,
  onCancel,
}: {
  modal: InputModalState
  onCancel: () => void
}) {
  const [value, setValue] = useState(modal.defaultValue ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    modal.onConfirm(value)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}
    >
      <form
        className="bg-surface-2 border border-surface-4 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-sm font-semibold text-white leading-tight pr-4">{modal.title}</h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-gray-300 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {modal.message && (
          <p className="text-xs text-muted mb-3 leading-relaxed">{modal.message}</p>
        )}
        <div className="mb-4">
          {modal.inputLabel && (
            <label className="block text-xs text-muted mb-1">{modal.inputLabel}</label>
          )}
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="input w-full text-sm"
            type={modal.inputType ?? 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={modal.placeholder}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className={`text-xs px-3 py-1.5 rounded font-medium text-white transition-colors disabled:opacity-50 ${modal.confirmClass ?? 'bg-accent hover:bg-accent/80'}`}
          >
            {modal.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  )
}
