import { Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown, { type Components } from 'react-markdown'
import { ChevronDown } from 'lucide-react'
import CoquillePublique, { NavSite } from '@/components/public/CoquillePublique'
import { Page } from '@/components/ui/page'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { SqueletteLignes } from '@/components/ui/squelette'
import { Tableau } from '@/components/ui/tableau'
import { Bouton } from '@/components/ui/bouton'
import { DOCUMENTS_JURIDIQUES, affinerTexte, ancreDe, decouperDefinitions, estSlugJuridique, mettreEnPage, preparerDocument, sommaireDe, type SlugJuridique } from '@/lib/pagesJuridiques'
import { decouperTables, type SegmentTable } from '@/lib/tablesMarkdown'
import { cn } from '@/lib/utils'

// Une colonne de lecture (680 px, le bord droit commun au texte et aux tableaux), titres en Manrope (le seul serif est le
// h1 de la page). Un titre d'article (22 px, sous un filet) domine nettement ses sous-titres (15 px).
const texteDe = (n: ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(texteDe).join('') : isValidElement<{ children?: ReactNode }>(n) ? texteDe(n.props.children) : ''
const TitreArticle = ({ children }: { children?: ReactNode }) => (
  <h2 id={ancreDe(texteDe(children))} className="mb-4 mt-12 scroll-mt-6 border-t border-bord pt-8 text-xl font-semibold text-fg max-md:mt-10 max-md:pt-6">{children}</h2>
)
/** Un lien : un nom, jamais une adresse brute. Un chemin « /legal/… » écrit tel quel prend le nom du document. */
function Lien({ children, href = '' }: { children?: ReactNode; href?: string }) {
  // un champ que l'éditeur n'a pas encore renseigné : il se coupe comme du texte au téléphone (jamais seul sur sa ligne), et
  // se resserre devant une ponctuation
  if (href.startsWith('#en-attente')) return <span data-en-attente="" className={cn('box-decoration-clone rounded-md bg-surface-1 py-0.5 pl-1.5 text-sm text-fg-2', href.endsWith('-ponctuation') ? 'pr-0.5' : 'pr-1.5')}>{children}</span>
  const brut = texteDe(children).trim() === href
  const classe = 'font-medium text-accent-text underline underline-offset-4'
  if (href.startsWith('/legal')) {
    const cible = DOCUMENTS_JURIDIQUES.find((d) => href === `/legal/${d.slug}`)
    return <Link to={href} className={classe}>{brut ? (cible ? cible.titre : 'Documents juridiques') : children}</Link>
  }
  if (href.startsWith('mailto:')) return <a href={href} className={cn(classe, 'whitespace-nowrap')}>{children}</a>
  return <a href={href} className={classe}>{brut ? href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : children}</a>
}
// La mesure de lecture : 70 à 75 signes par ligne en 15 px (jury, tour 3 : 90 à 95 sur 680 px). Les tableaux gardent la colonne.
const MESURE = 'max-w-[600px]'
const RENDU: Components = {
  h1: TitreArticle,
  h2: TitreArticle,
  h3: ({ children }) => <h3 className="mb-2 mt-8 text-base font-semibold text-fg">{children}</h3>,
  p: ({ children }) => <p className={cn('mb-4 text-base text-fg-2', MESURE)}>{children}</p>,
  ul: ({ children }) => <ul className={cn('mb-4 list-disc space-y-1.5 pl-5 text-base text-fg-2 marker:text-fg-3', MESURE)}>{children}</ul>,
  ol: ({ children }) => <ol className={cn('mb-4 list-decimal space-y-1.5 pl-5 text-base text-fg-2 marker:text-fg-3', MESURE)}>{children}</ol>,
  a: ({ children, href }) => <Lien href={href}>{children}</Lien>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-surface-1 px-1 font-sans text-sm text-fg">{children}</code>,
  hr: () => <hr className="my-8 border-bord" />,
}

/** Une cellule : du texte courant (gras, code), sans paragraphe autour. */
function Cellule({ texte }: { texte: string }) {
  return <ReactMarkdown components={{ ...RENDU, p: ({ children }) => <Fragment>{children}</Fragment> }}>{affinerTexte(texte)}</ReactMarkdown>
}

/** Un tableau du document, rendu par le tableau du système. Au téléphone chaque rangée s'empile et chaque valeur garde le
 *  nom de sa colonne ; une colonne de valeurs courtes (une durée, un nom) ne casse pas sa ligne. */
function TableauJuridique({ table }: { table: SegmentTable }) {
  const colonnes = table.entetes.map((titre, k) => ({
    cle: String(k), titre, tel: true,
    classe: k > 0 && table.lignes.every((l) => (l[k] ?? '').length <= 28) ? 'md:whitespace-nowrap' : undefined,
    rendu: (ligne: string[]) => <>{k > 0 && <span className="text-fg-3 md:hidden">{titre}{' : '}</span>}<Cellule texte={ligne[k] ?? ''} /></>,
  }))
  return <Tableau className="my-6" libelle={table.entetes.join(', ')} colonnes={colonnes} lignes={table.lignes} cle={(ligne) => ligne.join('|')} vide={null} />
}

/** « Libellé : valeur » en deux colonnes : les valeurs s'alignent (l'éditeur, le responsable du traitement). */
function Definitions({ lignes }: { lignes: { terme: string; valeur: string }[] }) {
  return (
    <dl className="mb-6 border-t border-bord">
      {lignes.map((l) => (
        <div key={l.terme} className="grid gap-x-6 gap-y-0.5 border-b border-bord py-3 last:border-b-0 md:grid-cols-[13rem_minmax(0,1fr)]">
          <dt className="text-sm text-fg-2 md:pt-px">{l.terme}</dt>
          <dd className="text-base text-fg"><Cellule texte={l.valeur} /></dd>
        </div>
      ))}
    </dl>
  )
}

/** Le sommaire : à droite du texte et collant sur un grand écran ; replié sous le titre au téléphone. */
function Sommaire({ articles }: { articles: { ancre: string; titre: string }[] }) {
  const [ouvert, setOuvert] = useState(false)
  if (articles.length < 3) return null
  return (
    <nav aria-label="Sommaire" className="max-lg:mb-6 max-lg:border-y max-lg:border-bord lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:overflow-y-auto lg:border-l lg:border-bord lg:pl-6">
      <p className="text-xs font-medium text-fg-3 max-lg:hidden lg:mb-2">Sommaire</p>
      <Bouton variante="discret" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)} className="-mx-3 w-[calc(100%+1.5rem)] justify-between lg:hidden">
        Sommaire, {articles.length} articles
        <ChevronDown aria-hidden strokeWidth={1.5} className={cn('size-4 text-fg-2 transition-transform duration-fast ease-survol', ouvert && 'rotate-180')} />
      </Bouton>
      <ol className={cn('lg:block', ouvert ? 'max-lg:pb-2' : 'max-lg:hidden')}>
        {articles.map((a) => (
          <li key={a.ancre}>
            <a href={`#${a.ancre}`} onClick={() => setOuvert(false)}
              className="flex min-h-8 items-center rounded py-1 text-sm text-fg-2 transition-colors duration-fast ease-survol hover:text-fg max-lg:min-h-11">{a.titre}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Les cinq documents : une rangée d'onglets au trait, alignée sur le bord du titre ; au téléphone elle défile de côté
 *  sur une seule ligne et amène l'onglet courant à l'écran. */
function OngletsJuridiques({ actif }: { actif: SlugJuridique }) {
  const courant = useRef<HTMLAnchorElement>(null)
  useEffect(() => { courant.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) }, [actif])
  return (
    <nav aria-label="Documents juridiques" className="mb-8 [scrollbar-width:none] flex gap-x-6 overflow-x-auto border-b border-bord max-md:-mx-4 max-md:mb-6 max-md:px-4">
      {DOCUMENTS_JURIDIQUES.map((d) => (
        <Link key={d.slug} to={`/legal/${d.slug}`} ref={d.slug === actif ? courant : undefined} aria-current={d.slug === actif ? 'page' : undefined}
          className={cn('-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 text-sm transition-colors duration-fast ease-survol',
            d.slug === actif ? 'border-fg font-semibold text-fg' : 'border-transparent text-fg-2 hover:text-fg')}>
          {d.libelle}
        </Link>
      ))}
    </nav>
  )
}

/** Le document prêt à dessiner : corps mis en page, date de mise à jour, sommaire. */
function lireMiseEnPage(markdown: string) {
  const { corps, miseAJour } = mettreEnPage(preparerDocument(markdown).corps)
  return { corps, miseAJour, articles: sommaireDe(corps) }
}

async function lireDocument(slug: SlugJuridique): Promise<string> {
  const reponse = await fetch(`/legal/${slug}.md`, { cache: 'no-cache' })
  if (!reponse.ok) throw new Error(`document ${slug} : ${reponse.status}`)
  return reponse.text()
}

/**
 * Pages juridiques : la coquille du site, les cinq documents à portée de clic, une colonne de lecture et, à sa droite, le
 * sommaire du document. Le texte vient de public/legal/*.md et n'est pas récrit ; ses tableaux sont de vrais tableaux, et un
 * champ que l'éditeur n'a pas encore renseigné se dessine comme un champ (lib/pagesJuridiques.ts). Chargement → erreur → contenu.
 */
export default function Legal() {
  const { slug } = useParams<{ slug?: string }>()
  const actif = estSlugJuridique(slug) ? slug : null
  const requete = useQuery({ queryKey: ['page-juridique', actif], queryFn: () => lireDocument(actif!), enabled: actif !== null, staleTime: Infinity, select: lireMiseEnPage })
  if (!actif) return <Navigate to="/legal/mentions-legales" replace />
  const document = DOCUMENTS_JURIDIQUES.find((d) => d.slug === actif)!

  return (
    <CoquillePublique nav={<NavSite />}>
      <Page titre={document.titre} sousTitre={requete.data?.miseAJour ?? undefined} avant={<OngletsJuridiques actif={actif} />}>
        <EtatRequete requete={requete} squelette={<div className="max-w-[680px]"><SqueletteLignes lignes={8} /></div>} vide={null} estVide={() => false}
          erreur={<EtatErreur titre="Ce document n’a pas pu se charger" detail="La connexion au serveur a échoué. Réessayez dans un instant." onReessayer={() => { void requete.refetch() }} enCours={requete.isFetching} />}>
          {(doc) => (
            <div className="lg:grid lg:grid-cols-[minmax(0,680px)_minmax(0,280px)] lg:items-start lg:justify-between lg:gap-x-16">
              <div className="lg:order-last"><Sommaire articles={doc.articles} /></div>
              <article data-lecture="" className="min-w-0 [&>h2:first-child]:mt-0 [&>h2:first-child]:border-t-0 [&>h2:first-child]:pt-0">
                {decouperTables(doc.corps).flatMap((s, i) => (s.type === 'table'
                  ? [<TableauJuridique key={i} table={s} />]
                  : decouperDefinitions(s.texte).map((b, j) => (b.type === 'definitions'
                    ? <Definitions key={`${i}-${j}`} lignes={b.lignes} />
                    : <ReactMarkdown key={`${i}-${j}`} components={RENDU}>{affinerTexte(b.texte)}</ReactMarkdown>))))}
              </article>
            </div>
          )}
        </EtatRequete>
      </Page>
    </CoquillePublique>
  )
}
