import * as React from 'react'
import { AlertCircle, Check, Clock, Info, X, type LucideIcon } from 'lucide-react'
import type { ThemeForce } from '@/lib/themeEcran'
import { cn } from '@/lib/utils'
import type { TonMessage } from './message'

/**
 * Le toast du système : la confirmation brève d'un geste qui vient d'aboutir (ou non), quand l'écran ne peut pas la dire
 * en place. En bas de l'écran (jamais par-dessus la barre du haut ni son bouton), au-dessus des onglets au téléphone ;
 * une icône, une phrase, une croix ; il s'efface seul après 5 s (8 s pour une erreur). Ouverture : 180 ms, opacité et 8 px.
 * Ce qui demande une décision ne passe jamais par un toast : un `Message` dans la page, ou un `Dialogue`.
 */
export interface ToastDonnees { id: string; message: string; ton: TonMessage }

const ICONES: Record<TonMessage, { icone: LucideIcon; encre: string }> = {
  info: { icone: Info, encre: 'text-bleu-ink' },
  succes: { icone: Check, encre: 'text-vert-ink' },
  attention: { icone: Clock, encre: 'text-ambre-ink' },
  erreur: { icone: AlertCircle, encre: 'text-rouge-ink' },
}

let ecouteur: ((t: ToastDonnees) => void) | null = null

/** Annonce un message bref. */
export function annoncer(message: string, ton: TonMessage = 'info') {
  ecouteur?.({ id: Math.random().toString(36).slice(2), message, ton })
}

function Toast({ toast, onRetirer }: { toast: ToastDonnees; onRetirer: (id: string) => void }) {
  const { icone: Icone, encre } = ICONES[toast.ton]
  React.useEffect(() => {
    const minuterie = setTimeout(() => onRetirer(toast.id), toast.ton === 'erreur' ? 8000 : 5000)
    return () => clearTimeout(minuterie)
  }, [onRetirer, toast.id, toast.ton])
  return (
    <div role={toast.ton === 'erreur' ? 'alert' : 'status'} data-toast={toast.ton}
      className={cn('toast-flottant pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border bg-surface-pop py-1 pl-4 pr-1 text-sm text-fg shadow-toast',
        // l'état se lit au trait, pas seulement à une icône de 18 px (jury, tour 1 : un échec se confondait avec une carte)
        toast.ton === 'erreur' ? 'border-rouge-mark' : toast.ton === 'attention' ? 'border-ambre-mark' : 'border-bord')}>
      <Icone aria-hidden size={18} strokeWidth={1.75} className={cn('shrink-0', encre)} />
      <p className="min-w-0 flex-1 py-2">{toast.message}</p>
      <button type="button" onClick={() => onRetirer(toast.id)} aria-label="Fermer le message"
        className="grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-colors duration-fast ease-survol hover:bg-surface-1 hover:text-fg active:scale-[.98]">
        <X aria-hidden size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}

/** La zone des toasts : posée une fois, par la coquille. `theme` : thème forcé de l'écran affiché (lib/themeEcran.ts). */
export function ZoneToasts({ theme }: { theme?: ThemeForce }) {
  const [toasts, setToasts] = React.useState<ToastDonnees[]>([])
  React.useEffect(() => {
    ecouteur = (t) => setToasts((avant) => [...avant.slice(-2), t])
    return () => { ecouteur = null }
  }, [])
  const retirer = React.useCallback((id: string) => setToasts((avant) => avant.filter((t) => t.id !== id)), [])
  if (toasts.length === 0) return null
  return (
    <div data-theme={theme} data-zone-toasts="" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4 max-[768px]:bottom-20">
      {toasts.map((t) => <Toast key={t.id} toast={t} onRetirer={retirer} />)}
    </div>
  )
}
