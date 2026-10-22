import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Crown, Sparkles, Zap } from 'lucide-react'
import { ESSAI_LIBELLE, INCLUS, OFFRES, prixLibelle, quotaLibelle, type Offre, type OffreId } from '@/lib/offres'

const ICONES: Record<OffreId, typeof Zap> = { essentiel: Sparkles, pro: Zap, business: Crown }

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
      className="block w-full text-center font-semibold py-3 rounded-xl text-sm transition-colors hover:text-[#F4F6FA]"
      style={{ background: '#1C222D', color: '#9BA4B5', border: '1px solid rgba(186,205,234,.13)' }}
    >
      Commencer avec {offre.nom}
    </Link>
  )
}

/** La grille des offres, identique partout où elle s'affiche (source : lib/offres.ts). */
export default function GrilleOffres({ action, compacte = false }: Props) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OFFRES.map((offre) => {
          const Icone = ICONES[offre.id]
          return (
            <div
              key={offre.id}
              className={`rounded-2xl flex flex-col ${compacte ? 'p-4' : 'p-7'}`}
              style={{ background: '#151A23', border: '1px solid rgba(186,205,234,.13)' }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(228,233,242,0.07)', border: '1px solid rgba(228,233,242,0.15)' }}
                >
                  <Icone size={17} style={{ color: '#E4E9F2' }} />
                </div>
                <h3 className="text-base font-bold" style={{ color: '#F4F6FA' }}>{offre.nom}</h3>
              </div>

              <div className="mb-3">
                <span
                  className={`${compacte ? 'text-3xl' : 'text-4xl'} font-extrabold`}
                  style={{ color: '#F4F6FA', fontFamily: 'Geist Sans, system-ui, sans-serif' }}
                >
                  {prixLibelle(offre)}
                </span>
                <span className="text-sm ml-1" style={{ color: '#9BA4B5' }}>/mois HT</span>
              </div>

              <p className="text-sm font-medium" style={{ color: '#E8EBF2' }}>{quotaLibelle(offre)}</p>
              {offre.analysesParMois === null && (
                <p className="text-xs mt-1" style={{ color: '#9BA4B5' }}>Dans un usage raisonnable</p>
              )}

              <div className={`mt-auto ${compacte ? 'pt-4' : 'pt-6'}`}>
                {action ? action(offre) : <LienInscription offre={offre} />}
              </div>
            </div>
          )
        })}
      </div>

      <div className={`${compacte ? 'mt-4' : 'mt-8'} text-sm`} style={{ color: '#9BA4B5' }}>
        <p className="font-semibold mb-2" style={{ color: '#E8EBF2' }}>Inclus dans les trois offres</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {INCLUS.map((ligne) => (
            <li key={ligne} className="flex items-start gap-2">
              <Check size={14} className="shrink-0 mt-0.5" style={{ color: '#E4E9F2' }} />
              <span>{ligne}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3">{ESSAI_LIBELLE}</p>
      </div>
    </div>
  )
}
