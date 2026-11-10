import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bouton } from '@/components/ui/bouton'
import { Champ, ChampDate } from '@/components/ui/champ'
import { Message } from '@/components/ui/message'
import { PastilleEtat, type Sens } from '@/components/ui/pastille'
import { Sigle } from '@/components/common/Sigle'
import { LIBELLE_ETAT_PIECE, PIECES_SUIVIES, etatPiece, type DonneesEntreprise, type EtatPiece, type PieceCoffre } from '@/lib/entreprise/avancement'
import { planifier } from '@/lib/entreprise/liste'
import type { CAEntry, MemoireConfig, Qualification, Reference } from '@/types'
import { appliquerPlan } from './appliquerPlan'
import { EditeurQualifications, EditeurReferences } from './EditeursCertifications'
import { CA_VIDE } from '@/lib/entreprise/charges'
import { AfficherPlus, BLOC_LISTE, BoutonAjout, BoutonRetrait, ChampNombre, Field, Groupe, Pleine } from './champs'
import CadreFormulaire from './CadreFormulaire'
import { ImportDialog } from './ImportMemoire'
import { useFormulaireRubrique } from './useFormulaireRubrique'
import { useLignesEditables } from './useLignesEditables'
import { cn } from '@/lib/utils'

// Vert : la pièce est au coffre-fort ; ambre : elle est à renouveler (à surveiller) ; gris : elle reste à joindre.
const SENS: Record<EtatPiece, Sens> = { au_coffre: 'vert', a_renouveler: 'ambre', a_joindre: 'gris' }
const LIEN = 'inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent-text underline-offset-4 hover:underline'
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
      explication="Vos qualifications, vos assurances et vos chantiers terminés : ce sont vos preuves, citées dans chaque mémoire."
      etat={f} onEnregistrer={f.enregistrer} avant={avant}
    >
      <ImportDialog ouvert={dialogue} onClose={() => setDialogue(false)} onImported={apresImport} />

      <Groupe titre="Qualifications" aide="Qualibat, Qualifelec… avec leur date de fin : Synorix vous prévient avant l'échéance.">
        <Pleine>
          <EditeurQualifications famille="qualification" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
        </Pleine>
      </Groupe>

      <Groupe titre="Assurances" aide="Responsabilité civile et décennale : assureur, numéro de contrat, activités garanties, date de fin.">
        <Pleine>
          <EditeurQualifications famille="assurance" lignes={qualifications.lignes} documents={coffre} modifier={qualifications.modifier} ajouter={qualifications.ajouter} retirer={qualifications.retirer} />
        </Pleine>
      </Groupe>

      <Groupe titre="Pièces au coffre-fort" aide="Les pièces que les dossiers de candidature réclament le plus souvent.">
        <Pleine>
          <ul className="divide-y divide-bord rounded-lg border border-bord bg-surface-0">
            {PIECES_ADMINISTRATIVES.map((p) => {
              const etat = etatPiece(donnees.documents, p.types)
              return (
                <li key={p.id} className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2">
                  <span className="text-sm text-fg">{p.libelle}</span>
                  <PastilleEtat sens={SENS[etat]}>{LIBELLE_ETAT_PIECE[etat]}</PastilleEtat>
                </li>
              )
            })}
          </ul>
          <Link to="/vault" className={cn(LIEN, 'mt-2')}>Ouvrir le coffre-fort</Link>
        </Pleine>
      </Groupe>

      <Groupe titre="Références" aide="Citées dans les mémoires, classées par pertinence. Des chantiers de moins de cinq ans.">
        <Pleine>
          <EditeurReferences lignes={references.lignes} modifier={references.modifier} retirer={references.retirer} ajouter={() => references.ajouter({ intitule: '' })} />
        </Pleine>
      </Groupe>

      <Groupe titre={<>Chiffres demandés dans la <Sigle code="DC2" /></>} aide="Les derniers exercices clos : chiffre d'affaires hors taxes et effectif moyen annuel.">
        <Pleine>
          <div className="space-y-2">
            {ca.map((ligne, i) => (
              <div key={i} className="flex items-center gap-2">
                <Champ aria-label="Année" className="w-20 shrink-0" placeholder="Année" inputMode="numeric" maxLength={4} value={ligne.annee}
                  onChange={(e) => majCA(i, { annee: e.target.value.replace(/\D/g, '') })} />
                <Champ aria-label="Chiffre d'affaires hors taxes" placeholder="1 200 000 €" maxLength={40} value={ligne.montant}
                  onChange={(e) => majCA(i, { montant: e.target.value })} />
                <ChampNombre aria-label="Effectif moyen annuel" placeholder="Effectif" max={999} className="w-24 shrink-0" valeur={ligne.effectif_moyen}
                  onChange={(v) => majCA(i, { effectif_moyen: v })} />
                {ca.length > 1 && (
                  <BoutonRetrait libelle="Retirer cette année" onClick={() => poserCA(ca.filter((_, j) => j !== i))} />
                )}
              </div>
            ))}
            {ca.length < 5 && (
              <BoutonAjout onClick={() => poserCA([...ca, { annee: '', montant: '' }])}>Ajouter une année</BoutonAjout>
            )}
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
              <div className={cn(BLOC_LISTE, 'grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]')}>
                <Field label={`Exercice ${ligne.annee || i + 1} : chiffre d'affaires du domaine`}>
                  <Champ maxLength={40} value={ligne.montant_domaine ?? ''} onChange={(e) => majCA(i, { montant_domaine: e.target.value })} />
                </Field>
                <Field label="Début de l'exercice">
                  <ChampDate valeur={ligne.exercice_debut} onChange={(iso) => majCA(i, { exercice_debut: iso })} />
                </Field>
                <Field label="Fin de l'exercice">
                  <ChampDate valeur={ligne.exercice_fin} onChange={(iso) => majCA(i, { exercice_fin: iso })} />
                </Field>
              </div>
            </Pleine>
          ))}
        </Groupe>
        <Groupe titre="Un mémoire déjà rédigé ?" aide="Importez-le : Synorix pré-remplit vos rubriques, vous vérifiez puis vous enregistrez.">
          <Pleine>
            {importe !== null && (
              <Message ton="succes" className="mb-3" onFermer={() => setImporte(null)}>
                {importe} champ{importe > 1 ? 's' : ''} pré-rempli{importe > 1 ? 's' : ''} : vérifiez-les dans Identité et Moyens, puis enregistrez.
              </Message>
            )}
            <Bouton variante="secondaire" onClick={() => setDialogue(true)}>Importer un mémoire</Bouton>
          </Pleine>
        </Groupe>
      </AfficherPlus>
    </CadreFormulaire>
  )
}
