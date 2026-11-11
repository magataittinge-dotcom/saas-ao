import { Fragment, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { decouperTables, type SegmentTable } from '@/lib/tablesMarkdown'
import { afficherACompleter, ANCRE_A_COMPLETER } from '@/lib/memoireBlocs'

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
/** « À compléter : … » surligné, comme dans le Word (le texte enregistré garde ses crochets : `afficherACompleter`). */
const A_COMPLETER: Components = {
  a: ({ href, children }) => (href === ANCRE_A_COMPLETER ? <mark className="a-renseigner">{children}</mark> : <a href={href}>{children}</a>),
}
const TITRES: Components = {
  ...A_COMPLETER,
  // Un schéma tapé au clavier (organigramme) : un encadré calme en Manrope, jamais un bloc de code en chasse fixe.
  pre: ({ children }) => <div className="my-4 whitespace-pre-wrap rounded-lg border border-bord bg-surface-1 px-4 py-3 font-sans text-sm leading-relaxed text-fg-2">{children}</div>,
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

function Tableau({ table }: { table: SegmentTable }) {
  const style = (k: number) => (table.alignements[k] ? { textAlign: table.alignements[k]! } : undefined)
  return (
    <div className="my-4 overflow-x-auto max-md:overflow-visible">
      <table className="w-full border-collapse text-left text-sm max-md:block">
        <thead className="max-md:sr-only">
          <tr>
            {table.entetes.map((e, k) => (
              <th key={k} style={style(k)} className="border border-bord-2 bg-surface-2 px-3 py-2 align-top font-semibold text-fg">
                <Cellule texte={e} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-md:grid max-md:gap-3">
          {table.lignes.map((ligne, r) => (
            <tr key={r} className="max-md:grid max-md:rounded-lg max-md:border max-md:border-bord-2">
              {ligne.map((c, k) => (
                <td key={k} style={style(k)} data-colonne={titreColonne(table.entetes[k])} className="border border-bord-2 px-3 py-2 align-top text-fg-2 max-md:block max-md:border-0 max-md:border-b max-md:!text-left max-md:last:border-b-0 max-md:before:mb-0.5 max-md:before:block max-md:before:text-xs max-md:before:font-semibold max-md:before:text-fg-3 max-md:before:content-[attr(data-colonne)]">
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
      {decouperTables(text).map((s, i) =>
        s.type === 'table' ? <Tableau key={i} table={s} /> : <ReactMarkdown key={i} components={TITRES}>{afficherACompleter(s.texte)}</ReactMarkdown>,
      )}
    </div>
  )
}
