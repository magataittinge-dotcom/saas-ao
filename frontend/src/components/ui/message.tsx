import * as React from 'react'
import { AlertCircle, Check, Clock, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TonMessage = 'info' | 'succes' | 'attention' | 'erreur'

const TONS: Record<TonMessage, { fond: string; encre: string; icone: LucideIcon }> = {
  info: { fond: 'bg-bleu-soft', encre: 'text-bleu-ink', icone: Info },
  succes: { fond: 'bg-vert-soft', encre: 'text-vert-ink', icone: Check },
  attention: { fond: 'bg-ambre-soft', encre: 'text-ambre-ink', icone: Clock },
  erreur: { fond: 'bg-rouge-soft', encre: 'text-rouge-ink', icone: AlertCircle },
}

/**
 * Message en ligne (bandeau) : là où le fait se produit, UNE fois (jamais sous le bouton et dans la barre du bas à la fois).
 * Une icône, une phrase qui dit ce qui s'est passé et quoi faire, une action au plus. Fond `*-soft`, texte `--text-1`, icône
 * `*-ink` : pas de bordure latérale colorée. `erreur` et `attention` sont annoncés (`role="alert"`), les autres `status`.
 */
export function Message({ ton = 'info', titre, children, action, onFermer, className }: {
  ton?: TonMessage
  titre?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  onFermer?: () => void
  className?: string
}) {
  const t = TONS[ton]
  const Icone = t.icone
  return (
    <div role={ton === 'erreur' || ton === 'attention' ? 'alert' : 'status'} data-message={ton}
      className={cn('flex items-start gap-3 rounded-lg px-4 py-3 text-sm text-fg', t.fond, className)}>
      <Icone aria-hidden size={18} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', t.encre)} />
      <div className="min-w-0 flex-1">
        {titre && <p className="font-semibold">{titre}</p>}
        {children && <div className={cn(titre && 'mt-0.5', 'text-fg-2')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onFermer && (
        <button type="button" onClick={onFermer} aria-label="Fermer le message" className="-my-2.5 -mr-2 grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-colors duration-fast ease-survol hover:text-fg active:scale-[.98]">
          <X aria-hidden size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  )
}
