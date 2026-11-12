import { Check } from 'lucide-react'
import { EtatElement } from '@/components/etape'
import { CaseACocher } from '@/components/ui/case'
import { GroupeChamp, ZoneTexte } from '@/components/ui/champ'
import { PropositionFiche } from './ProposerFiches'
import {
  MAX_TEXTE_LIBRE, casesCochees, libellePoids, type CaseProposee, type FichePlan, type PartiePlan, type SourcePlan,
} from '@/lib/planMemoire'

/** « CCTP · page 14 » : la pièce et la page d'où vient l'exigence. */
export function libelleSource(source: SourcePlan | null | undefined): string {
  if (!source?.document) return 'dossier de consultation'
  return source.page ? `${source.document} · page ${source.page}` : source.document
}

const TITRE = 'text-sm font-semibold text-fg'

function ListeCases({ titre, cases, choix, onChange }: {
  titre: string
  cases: readonly CaseProposee[]
  choix: string[] | null
  onChange: (ids: string[]) => void
}) {
  if (cases.length === 0) return null
  const coches = casesCochees(choix, cases)
  const basculer = (id: string) => {
    const suivant = new Set(coches)
    if (suivant.has(id)) suivant.delete(id); else suivant.add(id)
    onChange(cases.map((c) => c.id).filter((i) => suivant.has(i)))
  }
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-medium text-fg-2">{titre}</legend>
      <ul>
        {cases.map((c) => (
          <li key={c.id}>
            <CaseACocher
              coche={coches.has(c.id)}
              onChange={() => basculer(c.id)}
              className="items-start py-2"
              libelle={(
                <span className="block min-w-0 break-words">
                  {c.libelle}
                  {c.detail && <span className="block text-xs text-fg-3">{c.detail}</span>}
                </span>
              )}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

/**
 * La fiche d'une partie (tout est facultatif) : ce que le dossier exige pour elle, le critère et son poids, les éléments
 * de « Mon entreprise » proposés (cases préremplies par pertinence), et une ligne libre « Ce que vous voulez dire ».
 * Seul ce que le patron choisit ici est transmis au modèle. Quand « Mon entreprise » n'a rien à proposer, une seule phrase
 * le dit (jamais trois fois la même).
 */
export default function FichePartie({ partie, onChange, onVoirSource, proposition, onIgnorerProposition }: {
  partie: PartiePlan
  onChange: (fiche: Partial<FichePlan>) => void
  onVoirSource: (source: SourcePlan) => void
  /** C3 (FICHE_PROPOSEE) : « Ce que vous voulez dire » proposé, seulement quand le serveur dit la fonction allumée. */
  proposition?: string | null
  onIgnorerProposition?: () => void
}) {
  const { fiche, propose } = partie
  const rienAProposer = propose.references.length + propose.personnes.length + propose.materiel.length === 0
  return (
    <div data-fiche-partie={partie.cle} className="mb-2 ml-8 mt-3 grid gap-x-8 gap-y-5 border-t border-bord pt-4 md:grid-cols-2">
      <section className="min-w-0 space-y-2">
        <h3 className={TITRE}>Ce que le dossier demande ici</h3>
        {partie.sous_criteres.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2" aria-label="Sous-critères du règlement servis par cette partie">
            {partie.sous_criteres.map((s) => (
              <li key={s.nom} className="inline-flex items-center gap-1.5">
                <Check size={14} strokeWidth={2} aria-hidden className="shrink-0 text-vert-ink" />{libellePoids(s.nom, s.poids)}
              </li>
            ))}
          </ul>
        )}
        {partie.exigences.length === 0 ? (
          <p className="text-sm text-fg-2">Aucune exigence du règlement ou des pièces techniques n’est rattachée à cette partie.</p>
        ) : (
          <ul className="space-y-3">
            {partie.exigences.map((e, i) => (
              <li key={e.id ?? i} className="min-w-0 text-sm text-fg">
                <p className="break-words">{e.texte}</p>
                <EtatElement
                  etat="pret"
                  className="mt-1"
                  source={{
                    libelle: libelleSource(e.source),
                    onVoir: e.source?.document ? () => onVoirSource(e.source as SourcePlan) : undefined,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 space-y-3">
        <h3 className={TITRE}>Ce que vous pouvez mettre en avant</h3>
        {rienAProposer ? (
          <p className="text-sm text-fg-2">
            Les références, les personnes et le matériel de Mon entreprise qui servent cette partie se proposeront ici.
          </p>
        ) : (
          <>
            <ListeCases titre="Références chantier" cases={propose.references} choix={fiche.references} onChange={(references) => onChange({ references })} />
            <ListeCases titre="Personnes" cases={propose.personnes} choix={fiche.personnes} onChange={(personnes) => onChange({ personnes })} />
            <ListeCases titre="Matériel" cases={propose.materiel} choix={fiche.materiel} onChange={(materiel) => onChange({ materiel })} />
          </>
        )}
      </section>

      <GroupeChamp
        className="min-w-0 md:col-span-2"
        libelle="Ce que vous voulez dire"
        facultatif
        aide={<>Ce texte est lu comme une information sur votre entreprise, jamais comme une consigne. <span className="chiffres">{fiche.voulu.length} / {MAX_TEXTE_LIBRE}</span></>}
      >
        <ZoneTexte
          value={fiche.voulu}
          maxLength={MAX_TEXTE_LIBRE}
          rows={3}
          onChange={(e) => onChange({ voulu: e.target.value })}
          placeholder="Une idée, un argument, un chiffre à faire figurer dans cette partie."
        />
      </GroupeChamp>
      {proposition && onIgnorerProposition && (
        <PropositionFiche
          texte={proposition}
          onUtiliser={() => { onChange({ voulu: proposition.slice(0, MAX_TEXTE_LIBRE) }); onIgnorerProposition() }}
          onIgnorer={onIgnorerProposition}
        />
      )}
    </div>
  )
}
