import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Archive, CheckCircle2, Plus, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sigle } from '@/components/common/Sigle'
import { LIBELLE_ETAT_PIECE, PIECES_SUIVIES, etatPiece, type DonneesEntreprise, type EtatPiece, type PieceCoffre } from '@/lib/entreprise/avancement'
import { planifier } from '@/lib/entreprise/liste'
import type { CAEntry, MemoireConfig, Qualification, Reference } from '@/types'
import { appliquerPlan } from './appliquerPlan'
import { EditeurQualifications, EditeurReferences } from './EditeursCertifications'
import { CA_VIDE } from '@/lib/entreprise/charges'
import { AfficherPlus, BOUTON_AJOUT, BOUTON_RETRAIT, ChampNombre, Field, Groupe, Pleine } from './champs'
import CadreFormulaire from './CadreFormulaire'
import { ImportDialog } from './ImportMemoire'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { useLignesEditables } from './useLignesEditables'
import { cn } from '@/lib/utils'

const VARIANTE: Record<EtatPiece, 'success' | 'warning' | 'neutral'> = { au_coffre: 'success', a_renouveler: 'warning', a_joindre: 'neutral' }
const LIEN = 'inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline'
const CHAMPS_QUALIFICATION: (keyof Qualification)[] = ['famille', 'intitule', 'organisme', 'numero', 'perimetre', 'date_obtention', 'date_fin', 'document_id']
const CHAMPS_REFERENCE: (keyof Reference)[] = ['intitule', 'maitre_ouvrage', 'adresse', 'description', 'montant_ht', 'annee', 'mode_intervention', 'maitre_oeuvre', 'lot', 'client_type', 'client_adresse', 'client_nom_complet']
/** Pièces du coffre-fort listées ici : celles qui n'ont pas leur propre éditeur (qualification et assurances se déclarent plus haut). */
const PIECES_ADMINISTRATIVES = PIECES_SUIVIES.filter((p) => ['C19', 'C20', 'C21'].includes(p.id))

/**
 * Rubrique Certifications et références : qualifications, labels et assurances déclarés (table qualifications),
 * références de chantiers (table references), état des pièces du coffre-fort. Un seul « Enregistrer ».
 * L'import d'un ancien mémoire pré-remplit Identité et Moyens (à vérifier puis à enregistrer là-bas).
 */
/**
 * Rubrique Certifications et références : qualifications, labels et assurances déclarés (table qualifications),
 * références de chantiers (table references), état des pièces du coffre-fort, et les chiffres que demande le DC2
 * (chiffre d'affaires et effectif des derniers exercices, dans le profil). Un seul « Enregistrer », dans l'en-tête.
 * L'import d'un ancien mémoire pré-remplit Identité et Moyens (à vérifier puis à enregistrer là-bas).
 */
export default function FormCertifications({ donnees, avant, idPanneau, idOnglet }: { donnees: DonneesEntreprise; avant?: ReactNode; idPanneau?: string; idOnglet?: string }) {
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
  const ca: CAEntry[] = f.brouillon.profil.chiffre_affaires?.length ? f.brouillon.profil.chiffre_affaires : CA_VIDE()
  const poserCA = (lignes: CAEntry[]) => f.poserProfil('chiffre_affaires', lignes)
  const majCA = (i: number, changements: Partial<CAEntry>) => poserCA(ca.map((r, j) => (j === i ? { ...r, ...changements } : r)))

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
    <CadreFormulaire
      rubrique="certifications" titre="Certifications et références" idPanneau={idPanneau} idOnglet={idOnglet}
      explication="Vos qualifications, vos assurances et vos chantiers terminés : ce sont vos preuves, citées dans chaque mémoire."
      etat={f} onEnregistrer={f.enregistrer} avant={avant}
    >
      {dialogue && <ImportDialog onClose={() => setDialogue(false)} onImported={apresImport} />}

      <Groupe titre="Qualifications" aide="Qualibat, Qualifelec… avec leur date de fin : Synorix vous prévient avant l'échéance.">
        <Pleine>
          <EditeurQualifications famille="qualification" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
        </Pleine>
      </Groupe>

      <Groupe titre="Assurances" aide="Responsabilité civile et décennale : assureur, numéro de contrat, activités garanties, date de fin.">
        <Pleine>
          <EditeurQualifications famille="assurance" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
        </Pleine>
      </Groupe>

      <Groupe titre="Pièces au coffre-fort" aide="Les pièces que les dossiers de candidature réclament le plus souvent.">
        <Pleine>
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
          <Link to="/vault" className={cn(LIEN, 'mt-3')}><Archive size={16} aria-hidden /> Ouvrir le coffre-fort</Link>
        </Pleine>
      </Groupe>

      <Groupe titre="Références" aide="Citées dans les mémoires, classées par pertinence. Des chantiers de moins de cinq ans.">
        <Pleine>
          <EditeurReferences lignes={references.lignes} modifier={references.modifier} retirer={references.retirer} ajouter={() => references.ajouter({ intitule: '' })} />
        </Pleine>
      </Groupe>

      <Groupe titre={<>Chiffres demandés dans la <Sigle code="DC2" /></>} aide="Les derniers exercices clos : chiffre d'affaires hors taxes et effectif moyen annuel.">
        <Pleine>
          <div className="space-y-2">
            {ca.map((ligne, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label="Année" className="w-20 shrink-0" placeholder="Année" inputMode="numeric" maxLength={4} value={ligne.annee}
                  onChange={(e) => majCA(i, { annee: e.target.value.replace(/\D/g, '') })} />
                <Input aria-label="Chiffre d'affaires hors taxes" placeholder="1 200 000 €" maxLength={40} value={ligne.montant}
                  onChange={(e) => majCA(i, { montant: e.target.value })} />
                <ChampNombre aria-label="Effectif moyen annuel" placeholder="Effectif" max={999} className="w-24 shrink-0" valeur={ligne.effectif_moyen}
                  onChange={(v) => majCA(i, { effectif_moyen: v })} />
                {ca.length > 1 && (
                  <button type="button" onClick={() => poserCA(ca.filter((_, j) => j !== i))} aria-label="Retirer cette année" className={BOUTON_RETRAIT}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {ca.length < 5 && (
              <button type="button" onClick={() => poserCA([...ca, { annee: '', montant: '' }])} className={cn(BOUTON_AJOUT, 'mt-1')}>
                <Plus size={13} aria-hidden /> Ajouter une année
              </button>
            )}
            <p data-etat={ca.some((e) => e.annee.trim() && e.montant.trim()) ? 'rempli' : 'a-renseigner'} className="text-xs text-fg-3">
              {ca.some((e) => e.annee.trim() && e.montant.trim()) ? 'Renseigné' : <span className="font-medium text-accent-text">À renseigner</span>}
            </p>
          </div>
        </Pleine>
      </Groupe>

      <AfficherPlus>
        <Groupe titre="Labels" aide="RGE (Qualit'EnR, Qualibat RGE…).">
          <Pleine>
            <EditeurQualifications famille="rge" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
          </Pleine>
        </Groupe>
        <Groupe titre="Certifications de management" aide="ISO 9001, ISO 14001, MASE…">
          <Pleine>
            <EditeurQualifications famille="systeme_management" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
          </Pleine>
        </Groupe>
        <Groupe titre="Le détail de chaque exercice" aide="Chiffre d'affaires du domaine du marché et dates de l'exercice.">
          {ca.map((ligne, i) => (
            <Pleine key={i}>
              <div className="grid gap-2 rounded-lg border border-bord bg-surface-0 p-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
                <Field label={`Exercice ${ligne.annee || i + 1} : chiffre d'affaires du domaine`}>
                  <Input maxLength={40} value={ligne.montant_domaine ?? ''} onChange={(e) => majCA(i, { montant_domaine: e.target.value })} />
                </Field>
                <Field label="Début de l'exercice">
                  <Input type="date" value={ligne.exercice_debut ?? ''} onChange={(e) => majCA(i, { exercice_debut: e.target.value || null })} />
                </Field>
                <Field label="Fin de l'exercice">
                  <Input type="date" value={ligne.exercice_fin ?? ''} onChange={(e) => majCA(i, { exercice_fin: e.target.value || null })} />
                </Field>
              </div>
            </Pleine>
          ))}
        </Groupe>
        <Groupe titre="Un mémoire déjà rédigé ?" aide="Importez-le : Synorix pré-remplit vos rubriques, vous vérifiez puis vous enregistrez.">
          <Pleine>
            {importe !== null && (
              <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-accent-tint-2 bg-accent-tint px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-fg">
                  <CheckCircle2 size={18} className="shrink-0 text-accent-text" aria-hidden />
                  {importe} champ{importe > 1 ? 's' : ''} pré-rempli{importe > 1 ? 's' : ''} : vérifiez-les dans Identité et Moyens, puis enregistrez.
                </p>
                <button type="button" onClick={() => setImporte(null)} aria-label="Fermer le message" className="grid size-9 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-surface-0 hover:text-fg [@media(pointer:coarse)]:size-11">
                  <X size={16} aria-hidden />
                </button>
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => setDialogue(true)}>
              <Upload size={15} aria-hidden /> Importer un mémoire
            </Button>
          </Pleine>
        </Groupe>
      </AfficherPlus>
    </CadreFormulaire>
  )
}
