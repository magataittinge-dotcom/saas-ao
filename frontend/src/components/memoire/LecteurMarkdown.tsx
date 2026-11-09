import { Fragment } from 'react'
import ReactMarkdown from 'react-markdown'
import { decouperTables, type SegmentTable } from '@/lib/tablesMarkdown'

/** Une cellule de tableau : du texte courant (gras, italique), sans paragraphe autour. */
function Cellule({ texte }: { texte: string }) {
  return <ReactMarkdown components={{ p: ({ children }) => <Fragment>{children}</Fragment> }}>{texte}</ReactMarkdown>
}

function Tableau({ table }: { table: SegmentTable }) {
  const style = (k: number) => (table.alignements[k] ? { textAlign: table.alignements[k]! } : undefined)
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
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
                <td key={k} style={style(k)} className="border border-bord-2 px-3 py-2 align-top text-fg-2">
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
 * Le texte d'une partie du mémoire, lu dans Rédiger. Les couleurs viennent des jetons du thème (voir
 * `.lecteur-memoire` dans index.css) : le gabarit « prose-invert » rendait titres et gras en blanc sur fond clair.
 * Les tableaux Markdown sont rendus en vrais tableaux, comme dans le Word (G4).
 */
export default function LecteurMarkdown({ text }: { text: string }) {
  return (
    <div
      className="lecteur-memoire prose prose-sm max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-code:text-xs"
      style={{ fontFamily: 'var(--font-memoire)', fontFeatureSettings: '"tnum" 0' }}
    >
      {decouperTables(text).map((s, i) =>
        s.type === 'table' ? <Tableau key={i} table={s} /> : <ReactMarkdown key={i}>{s.texte}</ReactMarkdown>,
      )}
    </div>
  )
}
