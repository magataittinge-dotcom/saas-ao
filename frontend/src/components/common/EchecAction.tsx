import { AlertTriangle, RotateCcw, X } from 'lucide-react'

/** Une action qui n'a pas abouti, dite calmement, avec de quoi réessayer (1.16). */
export default function EchecAction({
  message, onReessayer, onFermer,
}: {
  message: string
  /** Absent quand réessayer ne changerait rien (ex. passage introuvable). */
  onReessayer?: () => void
  onFermer?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-sm"
      style={{ background: 'rgba(217,164,65,0.08)', border: '1px solid rgba(217,164,65,0.25)' }}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: '#D9A441' }} />
      <p className="flex-1 leading-relaxed" style={{ color: '#E8E9EB' }}>{message}</p>
      {onReessayer && (
        <button
          onClick={onReessayer}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-ds-bg-2"
          style={{ color: '#F7F8F8', border: '1px solid rgba(255,255,255,.12)' }}
        >
          <RotateCcw size={12} /> Réessayer
        </button>
      )}
      {onFermer && (
        <button
          onClick={onFermer}
          aria-label="Fermer le message"
          className="shrink-0 rounded p-0.5 transition-colors hover:bg-ds-bg-2"
          style={{ color: '#959597' }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
