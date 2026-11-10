import type { MutableRefObject, ReactNode } from 'react'
import LecteurMarkdown from '@/components/memoire/LecteurMarkdown'
import EtatPartieChoix from '@/components/memoire/EtatPartie'
import { BoutonRefaire, type CibleRefaire } from '@/components/memoire/RefaireSection'
import { etatDe, type EtatPartie, type EtatsSections } from '@/lib/memoireEtats'
import { ANNEXES_MEMOIRE, sectionsDuContenu, type SectionMemoire } from '@/lib/memoireSections'
import { titrePartieLisible } from '@/lib/planMemoire'
import type { MemoireContent, Project } from '@/types'

/** Le titre d'une partie du document (h2) : en serif, comme dans le mémoire imprimé, sans barre latérale. */
function TitrePartie({ children }: { children: ReactNode }) {
  return <h2 className="border-b border-bord pb-3 font-memoire text-xl font-semibold text-fg">{children}</h2>
}

/**
 * Le mémoire, tel que le client le lit : une feuille de papier (`--surface-0`, un trait, rayon 22), le texte en Newsreader
 * 17 px sur une colonne de 72 caractères. La feuille suit la page (aucun défilement dans le défilement) ; le sommaire et
 * les contrôles vivent autour. Chaque section porte ses deux gestes en mots, discrets : son état (« Rédigée » / « À refaire »)
 * et « Refaire cette partie ».
 */
export function DocumentView({
  content, project, docRef, onRefaire, refaireDesactive = false, etats, onEtat,
}: {
  content: MemoireContent
  project: Project
  docRef: MutableRefObject<HTMLDivElement | null>
  /** E2 — « Refaire cette partie » : absent, aucun bouton (aperçus, tests). */
  onRefaire?: (cible: CibleRefaire) => void
  refaireDesactive?: boolean
  /** E3 — états « À refaire » choisis par le patron (absent = tout « Rédigée ») et le moyen de les changer. */
  etats?: EtatsSections
  onEtat?: (cible: { part: string; cle: string }, etat: EtatPartie) => void
}) {
  const entete = (part: string, cle: string, label: string) => (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="min-w-0 break-words font-memoire text-lg font-semibold text-fg">{label}</h3>
      {(onEtat || onRefaire) && (
        <div className="-mx-3 flex flex-wrap items-center">
          {onEtat && (
            <EtatPartieChoix titre={label} etat={etatDe(etats, part, cle)} desactive={refaireDesactive}
              onChange={(e) => onEtat({ part, cle }, e)} />
          )}
          {onRefaire && (
            <BoutonRefaire titre={label} desactive={refaireDesactive} onClick={() => onRefaire({ part, cle, titre: label })} />
          )}
        </div>
      )}
    </div>
  )
  const textes = (part: SectionMemoire['part']) => (content[part] ?? {}) as unknown as Record<string, string>
  const items = (part: SectionMemoire['part']): [string, string][] =>
    sectionsDuContenu(content).filter((s) => s.part === part).map((s) => [s.cle, s.titre])
  const a = textes('partie_a')

  const partie = (part: SectionMemoire['part'], id: string) => (
    <section id={id}>
      <TitrePartie>{titrePartieLisible(part)}</TitrePartie>
      {items(part).map(([key, label]) =>
        textes(part)[key] ? (
          <div key={key} id={`sec-${key}`} className="mt-8 scroll-mt-6">
            {entete(part, key, label)}
            <LecteurMarkdown text={textes(part)[key]} />
          </div>
        ) : null,
      )}
    </section>
  )

  return (
    <article ref={docRef} data-surface="" data-document-memoire="" className="min-w-0 rounded-carte border border-bord bg-surface-0 shadow-card">
      <div className="mx-auto w-full max-w-[44rem] space-y-12 px-5 py-8 sm:px-10 sm:py-12">
        <header className="border-b border-bord-2 pb-6">
          <p className="font-memoire text-xl font-semibold text-fg">Mémoire justificatif</p>
          <p className="mt-1 text-sm text-fg-2">{project.name}</p>
        </header>

        <section id="preambule">
          <TitrePartie>Préambule</TitrePartie>
          <div id="preambule-intro" />
          <div id="preambule-contexte" />
          <div className="mt-6"><LecteurMarkdown text={content.preambule ?? ''} /></div>
        </section>

        {partie('partie_a', 'partie-a')}
        {partie('partie_b', 'partie-b')}
        {partie('partie_c', 'partie-c')}

        <section id="annexes">
          <TitrePartie>Annexes</TitrePartie>
          {ANNEXES_MEMOIRE.map(({ cle, titre }) => a?.[cle] ? (
            <div key={cle} id={`annexe-${cle}`} className="mt-8 scroll-mt-6">
              <h3 className="mb-2 font-memoire text-lg font-semibold text-fg">{titre}</h3>
              <LecteurMarkdown text={a[cle]} />
            </div>
          ) : null)}
        </section>
      </div>
    </article>
  )
}

export default DocumentView
