import { Children, Fragment, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { decouperTables, type SegmentTable } from '@/lib/tablesMarkdown'
import { afficherACompleter, ANCRE_A_COMPLETER } from '@/lib/memoireBlocs'
import { lireArbre, retirerConsignes, type NoeudArbre } from '@/lib/memoireAffichage'
import { cn } from '@/lib/utils'

/**
 * Les titres écrits dans le texte d'une section descendent sous ceux de l'écran (h1 : l'étape ; h2 : la partie ; h3 : la
 * section) : un « # » ou un « ## » du texte devient un h4, un « ### » un h5. Un seul h1 par écran, et des titres en serif à
 * l'échelle du document (22 px, puis 17 px), au lieu des titres géants du gabarit de prose.
 */
function Titre4({ children }: { children?: ReactNode }) {
  return <h4 className="mb-2 mt-8 font-memoire text-xl font-semibold leading-snug text-fg first:mt-0">{children}</h4>
}
function Titre5({ children }: { children?: ReactNode }) {
  return <h5 className="mb-1.5 mt-6 font-memoire text-lg font-semibold leading-snug text-fg">{children}</h5>
}
/**
 * « À compléter : … » surligné, comme dans le Word (le texte enregistré garde ses crochets : `afficherACompleter`).
 * P2-1 : aucun lien ni aucune image du texte n'arrive dans la page (le texte vient de l'IA, qui lit un DCE tiers) : un lien
 * devient son texte, une image son texte alternatif. Rien n'est chargé ni cliquable vers un tiers.
 */
const A_COMPLETER: Components = {
  a: ({ href, children }) => (href === ANCRE_A_COMPLETER ? <mark className="a-renseigner">{children}</mark> : <>{children}</>),
  img: ({ alt }) => <>{alt}</>,
}
/** Le texte brut d'un bloc (ce que le rendu Markdown a mis dans `pre > code`). */
function texteBrut(noeud: ReactNode): string {
  return Children.toArray(noeud).map((n) => (typeof n === 'string' || typeof n === 'number' ? String(n)
    : isValidElement<{ children?: ReactNode }>(n) ? texteBrut(n.props.children) : '')).join('')
}

/**
 * Un organigramme tapé au clavier, dessiné : chaque poste est une ligne (nom, puis ce qu'il porte), relié à celui dont il
 * dépend par un filet de 1 px. Les mots sont ceux du texte, dans leur ordre ; rien n'est ajouté ni retiré.
 */
function Arbre({ noeuds, racine = false }: { noeuds: NoeudArbre[]; racine?: boolean }) {
  return (
    <ul className={cn('m-0 list-none p-0', !racine && 'ml-1.5 pl-5')}>
      {noeuds.map((n, i) => (
        <li key={i} className={cn('relative m-0 p-0', !racine && 'pt-3')}>
          {!racine && (
            <>
              {/* le filet qui descend du poste au-dessus : il s'arrête au dernier poste, il ne pend pas dans le vide */}
              <span aria-hidden className={cn('absolute -left-5 top-0 w-px bg-bord-2', i === noeuds.length - 1 ? 'h-[1.45rem]' : 'h-full')} />
              <span aria-hidden className="absolute -left-5 top-[1.45rem] h-px w-3.5 bg-bord-2" />
            </>
          )}
          <p className="m-0 text-sm font-semibold leading-snug text-fg">{n.texte}</p>
          {n.detail && <p className="m-0 text-sm leading-snug text-fg-2">{n.detail}</p>}
          {n.enfants.length > 0 && <Arbre noeuds={n.enfants} />}
        </li>
      ))}
    </ul>
  )
}

function Schema({ children }: { children?: ReactNode }) {
  const arbre = lireArbre(texteBrut(children).replace(/\n$/, ''))
  if (arbre) return <div data-organigramme="" className="not-prose my-5 border-y border-bord py-4 font-sans"><Arbre noeuds={arbre} racine /></div>
  // Un autre schéma tapé au clavier : un encadré calme en Manrope, jamais un bloc de code en chasse fixe.
  return <div className="my-4 whitespace-pre-wrap rounded-lg border border-bord bg-surface-1 px-4 py-3 font-sans text-sm leading-relaxed text-fg-2">{children}</div>
}

const TITRES: Components = {
  ...A_COMPLETER,
  pre: ({ children }) => <Schema>{children}</Schema>,
  code: ({ children }) => <span>{children}</span>,
  h1: ({ children }) => <Titre4>{children}</Titre4>,
  h2: ({ children }) => <Titre4>{children}</Titre4>,
  h3: ({ children }) => <Titre5>{children}</Titre5>,
  h4: ({ children }) => <Titre5>{children}</Titre5>,
}

/** Une cellule de tableau : du texte courant (gras, italique), sans paragraphe autour. Une cellule « # » (l'en-tête d'une
 *  colonne de numéros) reste un « # » : sans cela, elle devenait un titre h1 vide dans la page. */
export function Cellule({ texte }: { texte: string }) {
  return <ReactMarkdown components={{ ...A_COMPLETER, p: ({ children }) => <Fragment>{children}</Fragment> }}>{afficherACompleter(texte.replace(/^(\s*)(#+)(\s|$)/, '$1\\$2$3'))}</ReactMarkdown>
}

/** Le titre d'une colonne, sans les marques du Markdown : il est redit au-dessus de chaque cellule au téléphone. */
const titreColonne = (e: string | undefined) => (e ?? '').replace(/[*_`#]/g, '').trim()

/**
 * Un tableau du mémoire. À l'ordinateur : sa grille. Au téléphone (jury, tour 3 : plus de cartes dans la carte du document) :
 * un tableau de deux colonnes reste un tableau ; au-delà, chaque rangée devient un paragraphe entre deux filets, sa première
 * cellule en titre, les suivantes précédées du nom de leur colonne (`.table-memoire-liste`, index.css).
 */
function Tableau({ table }: { table: SegmentTable }) {
  const style = (k: number) => (table.alignements[k] ? { textAlign: table.alignements[k]! } : undefined)
  const enListe = table.entetes.length > 2
  return (
    <div className="my-4 overflow-x-auto max-md:overflow-visible">
      <table className={cn('w-full border-collapse text-left text-sm', enListe && 'table-memoire-liste')}>
        <thead>
          <tr>
            {table.entetes.map((e, k) => (
              <th key={k} style={style(k)} className="border border-bord-2 bg-surface-2 px-3 py-2 align-top font-semibold text-fg">
                <Cellule texte={e} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.lignes.map((ligne, r) => (
            <tr key={r}>
              {ligne.map((c, k) => (
                <td key={k} style={style(k)} data-colonne={titreColonne(table.entetes[k])} className="break-words border border-bord-2 px-3 py-2 align-top text-fg-2">
                  <Cellule texte={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Le texte d'une partie du mémoire, lu dans Rédiger : Newsreader 17 px, interligne 1,65, 72 caractères par ligne au plus.
 * Les couleurs et la police viennent des jetons du thème (voir
 * `.lecteur-memoire` dans index.css) : le gabarit « prose-invert » rendait titres et gras en blanc sur fond clair.
 * Les tableaux Markdown sont rendus en vrais tableaux, comme dans le Word (G4).
 */
export default function LecteurMarkdown({ text }: { text: string }) {
  return (
    <div className="lecteur-memoire prose max-w-[72ch] text-lg leading-[1.65] prose-headings:font-semibold prose-code:text-xs text-pretty">
      {/* les notes de l'outil entre crochets ne sont pas montrées, comme dans le Word (lib/memoireAffichage.ts) */}
      {decouperTables(retirerConsignes(text)).map((s, i) =>
        s.type === 'table' ? <Tableau key={i} table={s} /> : <ReactMarkdown key={i} components={TITRES}>{afficherACompleter(s.texte)}</ReactMarkdown>,
      )}
    </div>
  )
}
