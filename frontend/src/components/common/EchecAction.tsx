import { AlertTriangle, RotateCcw, X } from 'lucide-react'

/** Une action qui n'a pas abouti, dite calmement, avec de quoi réessayer (1.16). */
export default function EchecAction({
  message, onReessayer, onFermer, calque = false,
}: {
  message: string
  /** Absent quand réessayer ne changerait rien (ex. passage introuvable). */
  onReessayer?: () => void
  onFermer?: () => void
  /** Écran déjà passé au thème clair « Calque ». */
  calque?: boolean
}) {
  if (calque) {
    return (
      <div role="alert" className="flex items-start gap-2.5 rounded-md bg-attention-fond px-3.5 py-2.5 text-sm">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-attention" />
        <p className="flex-1 leading-relaxed text-encre">{message}</p>
        {onReessayer && (
          <button
            onClick={onReessayer}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-ligne-forte bg-surface px-2.5 py-1 text-[13px] font-semibold text-encre transition-colors hover:bg-surface-2"
          >
            <RotateCcw size={12} /> Réessayer
          </button>
        )}
        {onFermer && (
          <button
            onClick={onFermer}
            aria-label="Fermer le message"
            className="shrink-0 rounded p-0.5 text-encre-3 transition-colors hover:bg-surface-2 hover:text-encre"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm"
      style={{ background: 'color-mix(in srgb, var(--warning-fg) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--warning-fg) 25%, transparent)' }}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--warning-fg)' }} />
      <p className="flex-1 leading-relaxed" style={{ color: 'var(--text-1)' }}>{message}</p>
      {onReessayer && (
        <button
          onClick={onReessayer}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-ds-bg-2"
          style={{ color: 'var(--text-1)', border: '1px solid var(--border-2)' }}
        >
          <RotateCcw size={12} /> Réessayer
        </button>
      )}
      {onFermer && (
        <button
          onClick={onFermer}
          aria-label="Fermer le message"
          className="shrink-0 rounded p-0.5 transition-colors hover:bg-ds-bg-2"
          style={{ color: 'var(--text-3)' }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
