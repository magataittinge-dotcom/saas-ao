import ReactMarkdown from 'react-markdown'

/**
 * Le texte d'une partie du mémoire, lu dans Rédiger. Les couleurs viennent des jetons du thème (voir
 * `.lecteur-memoire` dans index.css) : le gabarit « prose-invert » rendait titres et gras en blanc sur fond clair.
 */
export default function LecteurMarkdown({ text }: { text: string }) {
  return (
    <div
      className="lecteur-memoire prose prose-sm max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-code:text-xs"
      style={{ fontFamily: "'Inter Variable', 'Geist Sans', sans-serif" }}
    >
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  )
}
