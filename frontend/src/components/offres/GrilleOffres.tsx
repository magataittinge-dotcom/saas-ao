import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { ESSAI_LIBELLE, INCLUS, OFFRES, prixLibelle, quotaLibelle, type Offre } from '@/lib/offres'

interface Props {
  /** Bouton de chaque carte. Par défaut : lien vers l'inscription (pages publiques). */
  action?: (offre: Offre) => ReactNode
  /** Cartes resserrées (fenêtre d'abonnement, page Facturation). */
  compacte?: boolean
}

function LienInscription({ offre }: { offre: Offre }) {
  return (
    <Link
      to={`/register?plan=${offre.id}`}
      className="block w-full text-center font-semibold py-3 rounded-xl text-sm transition-colors hover:text-fg"
      style={{ background: 'var(--surface-1)', color: 'var(--text-2)', border: '1px solid var(--border-1)' }}
    >
      Commencer avec {offre.nom}
    </Link>
  )
}

/**
 * D23 (décision du fondateur, 12/11/2026) : la règle de résiliation, dite sous la grille au mur des offres et dans
 * Paramètres > Abonnement, mot pour mot. Le portail du paiement arrête l'abonnement à la fin de la période payée.
 */
export const PHRASE_RESILIATION = 'Résiliable à tout moment : l’accès reste ouvert jusqu’à la fin de la période payée, le mois entamé n’est pas remboursé. Facturation mensuelle sans engagement.'

/** La grille des offres, identique partout où elle s'affiche (source : lib/offres.ts). */
export default function GrilleOffres({ action, compacte = false }: Props) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OFFRES.map((offre) => {
          return (
            <div
              key={offre.id}
              className={`rounded-2xl flex flex-col ${compacte ? 'p-4' : 'p-7'}`}
              style={{ background: 'var(--surface-0)', border: '1px solid var(--border-1)' }}
            >
              <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-1)' }}>{offre.nom}</h3>

              <div className="mb-3">
                <span
                  className={`${compacte ? 'text-3xl' : 'text-4xl'} font-semibold`}
                  style={{ color: 'var(--text-1)' }}
                >
                  {prixLibelle(offre)}
                </span>
                <span className="text-sm ml-2" style={{ color: 'var(--text-3)' }}>/mois HT</span>
              </div>

              <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{quotaLibelle(offre)}</p>

              <div className={`mt-auto ${compacte ? 'pt-4' : 'pt-6'}`}>
                {action ? action(offre) : <LienInscription offre={offre} />}
              </div>
            </div>
          )
        })}
      </div>

      <div className={`${compacte ? 'mt-4' : 'mt-8'} text-sm`} style={{ color: 'var(--text-3)' }}>
        <p className="font-semibold mb-2" style={{ color: 'var(--text-1)' }}>Inclus dans les trois offres</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {INCLUS.map((ligne) => (
            <li key={ligne} className="flex items-start gap-2">
              <Check size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }} />
              <span>{ligne}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">{ESSAI_LIBELLE}</p>
      </div>
    </div>
  )
}
