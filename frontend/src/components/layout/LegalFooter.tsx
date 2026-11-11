/* Pied de page des écrans connectés : les liens que la loi demande et le copyright. Les pages publiques ont le leur.
 *
 * Sur la grille (jury, tour 1) : son contenu est dans LE conteneur de la coquille, donc son bord gauche est celui du titre
 * de la page et son bord droit celui du contenu, à 1 440 comme ailleurs. Avant : une largeur à lui (1 680 px, 24 px de
 * marge), décalée de la grille.
 * Au téléphone : deux rangées de trois, jamais un mot seul sur sa ligne (« Cookies » tombait seul à 390) ; le copyright est la
 * sixième case. Le texte du premier lien est sur le bord gauche de la page (la marge de la cible de 44 px sort dans la gouttière).
 * Il suit le thème choisi, comme toute la coquille.
 */
import { Link } from 'react-router-dom'

const LINKS = [
  { to: '/legal/mentions-legales', label: 'Mentions légales' },
  { to: '/legal/cgu', label: 'CGU' },
  { to: '/legal/cgv', label: 'CGV' },
  { to: '/legal/politique-confidentialite', label: 'Confidentialité' },
  { to: '/legal/cookies', label: 'Cookies' },
]

const LIEN = 'text-xs text-fg-3 transition-colors duration-fast ease-survol hover:text-fg max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-2.5 [@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center'

export default function LegalFooter() {
  return (
    <footer data-coquille="pied" className="mt-8 border-t border-bord">
      <div className="conteneur flex items-center justify-between gap-3 py-4 max-md:grid max-md:grid-cols-[auto_auto_auto] max-md:justify-start max-md:gap-x-1 max-md:gap-y-0 max-md:py-2">
        <span className="text-xs text-fg-3 max-md:order-last max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:px-2.5">
          © {new Date().getFullYear()} Synorix
        </span>
        <nav aria-label="Informations légales" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 max-md:contents">
          {LINKS.map((l, i) => (
            <Link key={l.to} to={l.to} className={i % 3 === 0 ? `${LIEN} max-md:-ml-2.5` : LIEN}>{l.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
