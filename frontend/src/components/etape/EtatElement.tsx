import { AlertCircle, CheckCircle2, CircleDashed, CircleHelp, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EtatPiece = 'pret' | 'a-verifier' | 'a-couvrir'

const ETATS: Record<EtatPiece, { texte: string; icone: LucideIcon; classe: string }> = {
  pret: { texte: 'Prêt', icone: CheckCircle2, classe: 'text-vert-ink' },
  'a-verifier': { texte: 'À vérifier', icone: CircleHelp, classe: 'text-ambre-ink' },
  'a-couvrir': { texte: 'À couvrir', icone: CircleDashed, classe: 'text-bleu-ink' },
}

export interface SourceEtat {
  /** « RC · page 4 » : la pièce et la page d'où vient l'élément. */
  libelle: string
  /** Ouvre le passage dans le dossier. Sans cette fonction, seule la source est écrite. */
  onVoir?: () => void
}

/**
 * L'état d'un élément, en petit sous lui (comme « Source : … · Voir l'extrait d'origine » sur Mon entreprise) :
 * une icône et un mot (jamais la couleur seule), puis sa source et « Voir dans le dossier ».
 * `texte` remplace le mot par défaut quand l'écran a un statut plus précis (« À renouveler avant le dépôt — valable jusqu'au… »).
 */
export function EtatElement({ etat, source, className, texte, perimee }: { etat: EtatPiece; source?: SourceEtat; className?: string; texte?: string; perimee?: boolean }) {
  // Une pièce dont la validité est déjà dépassée : « À renouveler » en rouge, avec son icône (COULEURS.md).
  const e = perimee ? { texte: 'À renouveler', icone: AlertCircle, classe: 'text-rouge-ink' } : ETATS[etat]
  const Icone = e.icone
  return (
    <p data-etat={etat} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-2', className)}>
      <span className={cn('inline-flex items-center gap-1.5 font-medium', e.classe)}>
        <Icone size={14} aria-hidden />
        {texte ?? e.texte}
      </span>
      {source && (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span>Source : {source.libelle}</span>
          {source.onVoir && (
            <button
              type="button"
              onClick={source.onVoir}
              className="inline-flex min-h-9 items-center rounded-xs font-medium text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              Voir dans le dossier
            </button>
          )}
        </span>
      )}
    </p>
  )
}

export default EtatElement
