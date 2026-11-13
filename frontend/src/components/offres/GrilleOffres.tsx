import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { classesBouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { ESSAI_LIBELLE, INCLUS, OFFRES, prixLibelle, quotaLibelle, type Offre } from '@/lib/offres'
import { cn } from '@/lib/utils'

interface Props {
  /** Bouton de chaque offre. Par défaut : lien vers l'inscription (pages publiques). */
  action?: (offre: Offre) => ReactNode
  /** Colonnes resserrées (fenêtre d'abonnement, page Facturation). */
  compacte?: boolean
}

function LienInscription({ offre }: { offre: Offre }) {
  return <Link to={`/register?plan=${offre.id}`} className={classesBouton('secondaire', 'w-full')}>Commencer avec {offre.nom}</Link>
}

/**
 * D23 (décision du fondateur, 12/11/2026) : la règle de résiliation, dite sous la grille au mur des offres et dans
 * Paramètres > Abonnement, mot pour mot. Le portail du paiement arrête l'abonnement à la fin de la période payée.
 */
export const PHRASE_RESILIATION = 'Résiliable à tout moment : l’accès reste ouvert jusqu’à la fin de la période payée, le mois entamé n’est pas remboursé. Facturation mensuelle sans engagement.'

/**
 * La grille des offres, identique partout où elle s'affiche (source : lib/offres.ts). Une seule surface découpée par des
 * filets (jury, tour 3 : trois cartes identiques côte à côte, « la grille de cartes que DESIGN.md interdit ») : une colonne
 * par offre, puis, sous un filet, ce que les trois comprennent, calé sur les mêmes colonnes (le libellé sous Essentiel, les
 * coches sous Pro et sous Business). Aucune offre n'est poussée : les prix, les quotas et les mots viennent de lib/offres.ts.
 */
export default function GrilleOffres({ action, compacte = false }: Props) {
  const marge = compacte ? 'p-4 sm:p-5' : 'p-5 sm:p-7'
  const colonne = 'min-w-0 border-bord max-md:border-t max-md:first:border-t-0 md:border-l md:first:border-l-0'
  const moitie = Math.ceil(INCLUS.length / 2)
  return (
    <Carte sansMarge data-grille-offres="">
      <ul aria-label="Les trois offres" className="grid md:grid-cols-3">
        {OFFRES.map((offre) => (
          <li key={offre.id} data-offre={offre.id} className={cn('flex flex-col', colonne, marge)}>
            <h3 className="text-lg font-semibold text-fg">{offre.nom}</h3>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
              <span className={cn('font-semibold text-fg', compacte ? 'text-xl' : 'text-h3')}>{prixLibelle(offre)}</span>
              <span className="text-sm text-fg-3">/mois HT</span>
            </p>
            <p className="mt-2 text-sm font-medium text-fg">{quotaLibelle(offre)}</p>
            <div className={cn('mt-auto', compacte ? 'pt-4' : 'pt-6')}>
              {action ? action(offre) : <LienInscription offre={offre} />}
            </div>
          </li>
        ))}
      </ul>

      <div data-inclus="" className="grid border-t border-bord md:grid-cols-3">
        <div className={cn('min-w-0', marge)}>
          <p className="text-sm font-semibold text-fg">Inclus dans les trois offres</p>
          <p className="mt-1.5 text-sm text-fg-2">{ESSAI_LIBELLE}</p>
        </div>
        {[INCLUS.slice(0, moitie), INCLUS.slice(moitie)].map((lignes, i) => (
          <ul key={i} className={cn('grid content-start gap-2 text-sm text-fg-2', marge, 'max-md:pt-0', i === 0 && 'max-md:pb-2')}>
            {lignes.map((ligne) => (
              <li key={ligne} className="flex items-start gap-2">
                <Check aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-3" />
                <span>{ligne}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </Carte>
  )
}
