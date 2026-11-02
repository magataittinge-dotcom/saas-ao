import { useId } from 'react'
import { EtatElement } from '@/components/etape'
import { Textarea } from '@/components/ui/input'
import {
  MAX_TEXTE_LIBRE, casesCochees, libellePoids, type CaseProposee, type FichePlan, type PartiePlan, type SourcePlan,
} from '@/lib/planMemoire'

/** « CCTP · page 14 » : la pièce et la page d'où vient l'exigence. */
export function libelleSource(source: SourcePlan | null | undefined): string {
  if (!source?.document) return 'dossier de consultation'
  return source.page ? `${source.document} · page ${source.page}` : source.document
}

function ListeCases({ titre, vide, cases, choix, onChange }: {
  titre: string
  vide: string
  cases: readonly CaseProposee[]
  choix: string[] | null
  onChange: (ids: string[]) => void
}) {
  const coches = casesCochees(choix, cases)
  const basculer = (id: string) => {
    const suivant = new Set(coches)
    if (suivant.has(id)) suivant.delete(id); else suivant.add(id)
    onChange(cases.map((c) => c.id).filter((i) => suivant.has(i)))
  }
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-fg-2">{titre}</legend>
      {cases.length === 0 ? (
        <p className="text-sm text-fg-3">{vide}</p>
      ) : (
        <ul className="space-y-1">
          {cases.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-9 cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 text-sm text-fg hover:bg-surface-0 [@media(pointer:coarse)]:min-h-11">
                <input
                  type="checkbox"
                  checked={coches.has(c.id)}
                  onChange={() => basculer(c.id)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent-ui)] [@media(pointer:coarse)]:size-5"
                />
                <span className="min-w-0 break-words">
                  {c.libelle}
                  {c.detail && <span className="block text-xs text-fg-3">{c.detail}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}

/**
 * La fiche d'une partie (tout est facultatif) : ce que le dossier exige pour elle, le critère et son poids, les éléments
 * de « Mon entreprise » proposés (cases préremplies par pertinence), et une ligne libre « Ce que vous voulez dire ».
 * Seul ce que le patron choisit ici est transmis au modèle.
 */
export default function FichePartie({ partie, onChange, onVoirSource }: {
  partie: PartiePlan
  onChange: (fiche: Partial<FichePlan>) => void
  onVoirSource: (source: SourcePlan) => void
}) {
  const idVoulu = useId()
  const { fiche, propose } = partie
  return (
    <div data-fiche-partie={partie.cle} className="mt-4 grid gap-6 border-t border-bord-2 pt-4 md:grid-cols-2">
      <section className="min-w-0 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Ce que le dossier demande ici</h4>
        {partie.sous_criteres.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Sous-critères du règlement servis par cette partie">
            {partie.sous_criteres.map((s) => (
              <li key={s.nom} className="pill pill-cyan">{libellePoids(s.nom, s.poids)}</li>
            ))}
          </ul>
        )}
        {partie.exigences.length === 0 ? (
          <p className="text-sm text-fg-3">Aucune exigence du règlement ou des pièces techniques n’est rattachée à cette partie.</p>
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

      <section className="min-w-0 space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-3">Ce que vous pouvez mettre en avant</h4>
        <ListeCases
          titre="Références chantier" vide="Aucune référence de Mon entreprise ne correspond à cette partie."
          cases={propose.references} choix={fiche.references} onChange={(references) => onChange({ references })}
        />
        <ListeCases
          titre="Personnes" vide="Aucune personne de l’équipe ne correspond à cette partie."
          cases={propose.personnes} choix={fiche.personnes} onChange={(personnes) => onChange({ personnes })}
        />
        <ListeCases
          titre="Matériel" vide="Aucun matériel de Mon entreprise ne correspond à cette partie."
          cases={propose.materiel} choix={fiche.materiel} onChange={(materiel) => onChange({ materiel })}
        />
      </section>

      <div className="min-w-0 md:col-span-2">
        <label htmlFor={idVoulu} className="mb-1 block text-sm font-medium text-fg-2">Ce que vous voulez dire</label>
        <Textarea
          id={idVoulu}
          value={fiche.voulu}
          maxLength={MAX_TEXTE_LIBRE}
          rows={3}
          onChange={(e) => onChange({ voulu: e.target.value })}
          placeholder="Une idée, un argument, un chiffre à faire figurer dans cette partie."
        />
        <p className="mt-1 text-xs text-fg-3">
          Facultatif. Ce texte est lu comme une information sur votre entreprise, jamais comme une consigne. {fiche.voulu.length} / {MAX_TEXTE_LIBRE}
        </p>
      </div>
    </div>
  )
}
