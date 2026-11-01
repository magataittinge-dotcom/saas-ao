import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, Award, CheckCircle2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LIBELLE_ETAT_PIECE, PIECES_SUIVIES, etatPiece, referenceRenseignee, type DonneesEntreprise, type EtatPiece } from '@/lib/entreprise/avancement'
import type { MemoireConfig } from '@/types'
import { ImportDialog } from './ImportMemoire'
import { Groupe } from './champs'

const VARIANTE: Record<EtatPiece, 'success' | 'warning' | 'neutral'> = { au_coffre: 'success', a_renouveler: 'warning', a_joindre: 'neutral' }
const LIEN = 'inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline'

/**
 * Rubrique Certifications et références. Les pièces vivent dans le coffre-fort et les références dans leur page :
 * ici, leur état d'un coup d'œil et le chemin pour les compléter. L'import d'un ancien mémoire pré-remplit
 * les rubriques Identité et Moyens (à vérifier puis à enregistrer là-bas).
 */
export default function FormCertifications({ donnees }: { donnees: DonneesEntreprise }) {
  const queryClient = useQueryClient()
  const [dialogue, setDialogue] = useState(false)
  const [importe, setImporte] = useState<number | null>(null)
  const references = donnees.references ?? []
  const pretes = references.filter(referenceRenseignee).length

  const apresImport = (extrait: Partial<MemoireConfig>, nombre: number) => {
    const fusion: Record<string, unknown> = { ...(donnees.profil ?? {}) }
    for (const [k, v] of Object.entries(extrait)) {
      if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) fusion[k] = v
    }
    queryClient.setQueryData(['memoire-config'], fusion)
    setImporte(nombre)
    setDialogue(false)
  }

  return (
    <div className="space-y-6">
      {dialogue && <ImportDialog onClose={() => setDialogue(false)} onImported={apresImport} />}

      <Groupe titre="Pièces au coffre-fort" aide="Les pièces que les dossiers de candidature réclament le plus souvent.">
        <ul className="divide-y divide-bord-2 rounded-lg border border-bord-2 bg-surface-0">
          {PIECES_SUIVIES.map((p) => {
            const etat = etatPiece(donnees.documents, p.types)
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm text-fg">{p.libelle}</span>
                <Badge variant={VARIANTE[etat]}>{LIBELLE_ETAT_PIECE[etat]}</Badge>
              </li>
            )
          })}
        </ul>
        <Link to="/vault" className={LIEN}><Archive size={16} aria-hidden /> Ouvrir le coffre-fort</Link>
      </Groupe>

      <Groupe titre="Références de chantiers" aide="Citées dans les mémoires, classées par pertinence.">
        <p className="text-sm text-fg-2">
          {references.length === 0
            ? 'Aucune référence enregistrée pour le moment.'
            : `${references.length} référence${references.length > 1 ? 's' : ''}, dont ${pretes} prête${pretes > 1 ? 's' : ''} à citer.`}
        </p>
        <Link to="/references" className={LIEN}><Award size={16} aria-hidden /> Gérer mes références</Link>
      </Groupe>

      <Groupe titre="Un mémoire déjà rédigé ?" aide="Importez-le : Synorix pré-remplit vos rubriques, vous vérifiez puis vous enregistrez.">
        {importe !== null && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-accent-tint-2 bg-accent-tint px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              <CheckCircle2 size={18} className="shrink-0 text-accent-text" aria-hidden />
              {importe} champ{importe > 1 ? 's' : ''} pré-rempli{importe > 1 ? 's' : ''} : vérifiez-les dans Identité et Moyens, puis enregistrez.
            </p>
            <button type="button" onClick={() => setImporte(null)} aria-label="Fermer le message" className="grid size-9 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-surface-0 hover:text-fg [@media(pointer:coarse)]:size-11">
              <X size={16} aria-hidden />
            </button>
          </div>
        )}
        <div>
          <Button type="button" variant="outline" onClick={() => setDialogue(true)}>
            <Upload size={15} aria-hidden /> Importer un mémoire
          </Button>
        </div>
      </Groupe>
    </div>
  )
}
