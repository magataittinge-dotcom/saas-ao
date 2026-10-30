import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { FicheAction } from '@/lib/intelligence/action'

/** La fiche : un AO ou un compteur du coffre-fort, ce qu'il reste à faire, et le lien vers l'écran concerné. */
export default function ProchaineAction({ fiche }: { fiche: FicheAction }) {
  return (
    <section className="syx-fiche" aria-live="polite" aria-labelledby="syx-fiche-titre" data-fiche>
      <p className="syx-etiquette">{fiche.etiquette}</p>
      <h3 className="syx-fiche-titre" id="syx-fiche-titre">{fiche.titre}</h3>
      {fiche.meta && <p className="syx-meta">{fiche.meta}</p>}
      {(fiche.statut || fiche.quand) && (
        <div className="syx-etat">
          {fiche.statut && <span className="syx-statut" data-ton={fiche.statut.ton}>{fiche.statut.texte}</span>}
          {fiche.quand && <span className="syx-quand">{fiche.quand}</span>}
        </div>
      )}
      <p className="syx-texte">{fiche.texte}</p>
      {(fiche.cta || fiche.second) && (
        <div className="syx-boutons">
          {fiche.cta && (
            <Link className="syx-cta" to={fiche.cta.vers} data-action="cta">
              {fiche.cta.libelle} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
          {fiche.second && <Link className="syx-lien" to={fiche.second.vers}>{fiche.second.libelle}</Link>}
        </div>
      )}
    </section>
  )
}
