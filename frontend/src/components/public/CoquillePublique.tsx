import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Aurore from '@/components/layout/Aurore'
import { Marque } from './Marque'
import { classesBouton } from '@/components/ui/bouton'
import { cn } from '@/lib/utils'

export const LIENS_JURIDIQUES = [
  { vers: '/legal/mentions-legales', libelle: 'Mentions légales' },
  { vers: '/legal/cgu', libelle: 'CGU' },
  { vers: '/legal/cgv', libelle: 'CGV' },
  { vers: '/legal/politique-confidentialite', libelle: 'Confidentialité' },
  { vers: '/legal/cookies', libelle: 'Cookies' },
] as const

const LIEN_PIED = 'inline-flex items-center rounded text-xs text-fg-2 underline-offset-4 transition-colors duration-fast ease-survol hover:text-fg hover:underline max-md:px-2.5 [@media(pointer:coarse)]:min-h-11 max-md:min-h-11'

/** Le pied des pages publiques : l'année, les cinq documents juridiques. Rien d'autre. Au téléphone : les liens sur deux rangées
 *  (trois, puis deux : jamais « Cookies » seul sur sa ligne), et le copyright sur sa propre ligne, sous un filet (jury, tour 3 : rangé
 *  dans la grille des liens, il se lisait comme un sixième lien). */
export function PiedPublic() {
  return (
    <footer className="relative border-t border-bord">
      <div className="conteneur flex items-center justify-between gap-x-6 py-5 max-md:grid max-md:grid-cols-[auto_auto_auto] max-md:justify-start max-md:gap-x-1 max-md:py-2">
        <p className="text-xs text-fg-2 max-md:order-last max-md:col-span-3 max-md:border-t max-md:border-bord max-md:pb-2 max-md:pt-3 max-md:text-fg-3">© {new Date().getFullYear()} Synorix</p>
        <nav aria-label="Informations légales" className="flex flex-wrap items-center gap-x-5 gap-y-1 max-md:contents">
          {LIENS_JURIDIQUES.map((l, i) => (
            <Link key={l.vers} to={l.vers} className={i % 3 === 0 ? `${LIEN_PIED} max-md:-ml-2.5` : LIEN_PIED}>{l.libelle}</Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}

/**
 * La coquille des pages publiques (site, tarifs, pages juridiques, connexion, inscription, adresse inconnue d'un visiteur) :
 * le même produit que l'appli. Fond de page et aurore du système, clair ou nuit selon le thème choisi, le même conteneur
 * (1 200 px, gouttière 16 / 24 / 32), le même logo. `nav` : les liens de droite (aucun sur la connexion).
 */
export default function CoquillePublique({ children, nav, className }: { children: ReactNode; nav?: ReactNode; className?: string }) {
  return (
    <div data-coquille-publique="" className="relative isolate flex min-h-svh flex-col bg-surface-page text-fg">
      <Aurore />
      <header className="relative">
        <div className="conteneur flex min-h-[72px] items-center justify-between gap-4 py-3">
          <Link to="/" aria-label="Synorix, accueil du site" className="inline-flex min-h-11 items-center rounded-lg">
            <Marque />
          </Link>
          {nav && <nav aria-label="Site" className="flex items-center gap-2">{nav}</nav>}
        </div>
      </header>
      <main className={cn('conteneur relative flex-1 pb-16 pt-6 max-[768px]:pt-4', className)}>{children}</main>
      <PiedPublic />
    </div>
  )
}

/** Les liens de droite du site : Tarifs, Se connecter. Le geste principal (« Créer mon compte ») est dans la page.
 *  `tarifs="courant"` : sur la page Tarifs, le lien reste et dit qu'on y est (surface neutre, `aria-current`). */
export function NavSite({ tarifs = true }: { tarifs?: boolean | 'courant' }) {
  return (
    <>
      {tarifs && <Link to="/pricing" aria-current={tarifs === 'courant' ? 'page' : undefined} className={classesBouton('discret', cn('max-md:min-h-11', tarifs === 'courant' && 'bg-surface-1 text-fg'))}>Tarifs</Link>}
      <Link to="/login" className={classesBouton('secondaire')}>Se connecter</Link>
    </>
  )
}
