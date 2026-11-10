import { Fragment } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown, { type Components } from 'react-markdown'
import CoquillePublique, { NavSite } from '@/components/public/CoquillePublique'
import { Page } from '@/components/ui/page'
import { EtatErreur, EtatRequete } from '@/components/ui/etats'
import { SqueletteLignes } from '@/components/ui/squelette'
import { Tableau } from '@/components/ui/tableau'
import { classesBouton } from '@/components/ui/bouton'
import { DOCUMENTS_JURIDIQUES, estSlugJuridique, preparerDocument, type SlugJuridique } from '@/lib/pagesJuridiques'
import { decouperTables, type SegmentTable } from '@/lib/tablesMarkdown'
import { cn } from '@/lib/utils'

// Une colonne de lecture : 68 signes par ligne au plus, titres en Manrope (le seul serif est le h1 de la page).
const LIGNE = 'max-w-[68ch]'
const RENDU: Components = {
  h1: ({ children }) => <h2 className="mb-3 mt-10 text-lg font-semibold text-fg">{children}</h2>,
  h2: ({ children }) => <h2 className="mb-3 mt-10 text-lg font-semibold text-fg">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-6 text-base font-semibold text-fg">{children}</h3>,
  p: ({ children }) => <p className={cn(LIGNE, 'mb-4 text-base text-fg-2')}>{children}</p>,
  ul: ({ children }) => <ul className={cn(LIGNE, 'mb-4 list-disc space-y-1.5 pl-5 text-base text-fg-2 marker:text-fg-3')}>{children}</ul>,
  ol: ({ children }) => <ol className={cn(LIGNE, 'mb-4 list-decimal space-y-1.5 pl-5 text-base text-fg-2 marker:text-fg-3')}>{children}</ol>,
  a: ({ children, href }) => <a href={href} className="font-medium text-accent-text underline underline-offset-4">{children}</a>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-surface-1 px-1 font-sans text-sm text-fg">{children}</code>,
  hr: () => <hr className="my-8 border-bord" />,
}

/** Une cellule : du texte courant (gras, code), sans paragraphe autour. */
function Cellule({ texte }: { texte: string }) {
  return <ReactMarkdown components={{ ...RENDU, p: ({ children }) => <Fragment>{children}</Fragment> }}>{texte}</ReactMarkdown>
}

/** Un tableau du document, rendu par le tableau du système (au téléphone, chaque rangée s'empile). */
function TableauJuridique({ table }: { table: SegmentTable }) {
  const colonnes = table.entetes.map((titre, k) => ({ cle: String(k), titre, tel: true, rendu: (ligne: string[]) => <Cellule texte={ligne[k] ?? ''} /> }))
  return <Tableau className="my-6" libelle={table.entetes.join(', ')} colonnes={colonnes} lignes={table.lignes} cle={(ligne) => ligne.join('|')} vide={null} />
}

async function lireDocument(slug: SlugJuridique): Promise<string> {
  const reponse = await fetch(`/legal/${slug}.md`, { cache: 'no-cache' })
  if (!reponse.ok) throw new Error(`document ${slug} : ${reponse.status}`)
  return reponse.text()
}

/**
 * Pages juridiques : la coquille du site, une colonne de lecture, les cinq documents à portée de clic. Le texte vient de
 * public/legal/*.md et n'est pas récrit ; ses tableaux sont de vrais tableaux, et un champ que l'éditeur n'a pas encore
 * renseigné s'affiche « Information en cours d'enregistrement » (lib/pagesJuridiques.ts). Chargement → erreur → contenu.
 */
export default function Legal() {
  const { slug } = useParams<{ slug?: string }>()
  const actif = estSlugJuridique(slug) ? slug : null
  const requete = useQuery({ queryKey: ['page-juridique', actif], queryFn: () => lireDocument(actif!), enabled: actif !== null, staleTime: Infinity, select: preparerDocument })
  if (!actif) return <Navigate to="/legal/mentions-legales" replace />
  const document = DOCUMENTS_JURIDIQUES.find((d) => d.slug === actif)!

  return (
    <CoquillePublique nav={<NavSite />}>
      <Page etroite titre={requete.data?.titre ?? document.libelle}
        avant={(
          <nav aria-label="Documents juridiques" className="-ml-3 mb-6 flex flex-wrap gap-x-1 gap-y-1">
            {DOCUMENTS_JURIDIQUES.map((d) => (
              <Link key={d.slug} to={`/legal/${d.slug}`} aria-current={d.slug === actif ? 'page' : undefined}
                className={classesBouton('discret', d.slug === actif ? 'bg-surface-1 text-fg' : undefined)}>
                {d.libelle}
              </Link>
            ))}
          </nav>
        )}>
        <EtatRequete requete={requete} squelette={<SqueletteLignes lignes={8} />} vide={null} estVide={() => false}
          erreur={<EtatErreur titre="Ce document n’a pas pu se charger" detail="La connexion au serveur a échoué. Réessayez dans un instant." onReessayer={() => { void requete.refetch() }} enCours={requete.isFetching} />}>
          {(doc) => (
            <article>
              {decouperTables(doc.corps).map((s, i) => (s.type === 'table'
                ? <TableauJuridique key={i} table={s} />
                : <ReactMarkdown key={i} components={RENDU}>{s.texte}</ReactMarkdown>))}
            </article>
          )}
        </EtatRequete>
      </Page>
    </CoquillePublique>
  )
}
