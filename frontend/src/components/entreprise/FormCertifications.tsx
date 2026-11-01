import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, CheckCircle2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LIBELLE_ETAT_PIECE, PIECES_SUIVIES, etatPiece, type DonneesEntreprise, type EtatPiece, type PieceCoffre } from '@/lib/entreprise/avancement'
import { planifier } from '@/lib/entreprise/liste'
import type { MemoireConfig, Qualification, Reference } from '@/types'
import { appliquerPlan } from './appliquerPlan'
import { EditeurQualifications, EditeurReferences } from './EditeursCertifications'
import { AfficherPlus, Groupe, PiedEnregistrer } from './champs'
import { ImportDialog } from './ImportMemoire'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { useLignesEditables } from './useLignesEditables'

const VARIANTE: Record<EtatPiece, 'success' | 'warning' | 'neutral'> = { au_coffre: 'success', a_renouveler: 'warning', a_joindre: 'neutral' }
const LIEN = 'inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline'
const CHAMPS_QUALIFICATION: (keyof Qualification)[] = ['famille', 'intitule', 'organisme', 'numero', 'perimetre', 'date_obtention', 'date_fin', 'document_id']
const CHAMPS_REFERENCE: (keyof Reference)[] = ['intitule', 'maitre_ouvrage', 'adresse', 'description', 'montant_ht', 'annee', 'mode_intervention', 'maitre_oeuvre', 'lot', 'client_type', 'client_adresse']
/** Pièces du coffre-fort listées ici : celles qui n'ont pas leur propre éditeur (qualification et assurances se déclarent plus haut). */
const PIECES_ADMINISTRATIVES = PIECES_SUIVIES.filter((p) => ['C19', 'C20', 'C21'].includes(p.id))

/**
 * Rubrique Certifications et références : qualifications, labels et assurances déclarés (table qualifications),
 * références de chantiers (table references), état des pièces du coffre-fort. Un seul « Enregistrer ».
 * L'import d'un ancien mémoire pré-remplit Identité et Moyens (à vérifier puis à enregistrer là-bas).
 */
export default function FormCertifications({ donnees }: { donnees: DonneesEntreprise }) {
  const queryClient = useQueryClient()
  const [dialogue, setDialogue] = useState(false)
  const [importe, setImporte] = useState<number | null>(null)
  const qualifications = useLignesEditables<Qualification>(donnees.qualifications as Qualification[] | null)
  const references = useLignesEditables<Reference>(donnees.references as Reference[] | null)
  const f = useFormulaireRubrique('certifications', donnees, {
    invalider: ['qualifications', 'references'],
    enregistrer: async () => {
      const planQ = planifier<Qualification>(donnees.qualifications as Qualification[] | null, qualifications.lignes, CHAMPS_QUALIFICATION, 'intitule')
      await appliquerPlan('/qualifications', planQ)
      const planR = planifier<Reference>(donnees.references as Reference[] | null, references.lignes, CHAMPS_REFERENCE, 'intitule')
      await appliquerPlan('/references', planR)
    },
  })
  const coffre = (donnees.documents ?? []).filter((d): d is Required<Pick<PieceCoffre, 'id' | 'file_name' | 'type'>> => typeof d.id === 'string' && typeof d.file_name === 'string')

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
    <form onSubmit={(e) => { e.preventDefault(); f.enregistrer() }} className="space-y-6">
      {dialogue && <ImportDialog onClose={() => setDialogue(false)} onImported={apresImport} />}

      <Groupe titre="Qualifications professionnelles" aide="Qualibat, Qualifelec… avec leur date de fin : Synorix vous prévient avant l'échéance.">
        <EditeurQualifications famille="qualification" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
      </Groupe>

      <Groupe titre="Assurances" aide="Responsabilité civile et décennale : assureur, numéro de contrat, activités garanties, date de fin.">
        <EditeurQualifications famille="assurance" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
      </Groupe>

      <Groupe titre="Pièces au coffre-fort" aide="Les pièces que les dossiers de candidature réclament le plus souvent.">
        <ul className="divide-y divide-bord-2 rounded-lg border border-bord-2 bg-surface-0">
          {PIECES_ADMINISTRATIVES.map((p) => {
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

      <Groupe titre="Références de chantiers" aide="Citées dans les mémoires, classées par pertinence. Des chantiers de moins de cinq ans.">
        <EditeurReferences lignes={references.lignes} modifier={references.modifier} retirer={references.retirer} ajouter={() => references.ajouter({ intitule: '' })} />
      </Groupe>

      <AfficherPlus>
        <Groupe titre="Labels" aide="RGE (Qualit'EnR, Qualibat RGE…).">
          <EditeurQualifications famille="rge" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
        </Groupe>
        <Groupe titre="Certifications de management" aide="ISO 9001, ISO 14001, MASE…">
          <EditeurQualifications famille="systeme_management" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
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
      </AfficherPlus>

      <PiedEnregistrer enCours={f.enCours} reussi={f.reussi} erreur={f.erreur} />
    </form>
  )
}
