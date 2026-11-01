// Le corps de l'accueil : la veille des appels d'offres. Recherche de zone et carte à gauche, filtres et liste des
// avis à droite. Chargé à la demande par le tableau de bord (React.lazy) : la carte et ses données ne pèsent
// que sur l'accueil.
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CarteFrance from './CarteFrance'
import ListeAvis from './ListeAvis'
import RechercheZone from './RechercheZone'
import { DEPARTEMENTS } from './donnees/departements'
import { useVeille } from '@/hooks/useVeille'
import { etapeElargir } from '@/lib/veille'
import { SOURCE_VEILLE } from '@/services/veille'

const NOMS: Readonly<Record<string, string>> = Object.fromEntries(DEPARTEMENTS.map((d) => [d.code, d.nom]))

/** « Données BOAMP du 31/10 à 08:12 » (heure locale) — décision du 1/11 : en petit, à côté de la source. */
export function libelleActualisation(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const jour = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  const heure = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `Données BOAMP du ${jour} à ${heure}`
}

export default function VeilleAccueil() {
  const navigate = useNavigate()
  const v = useVeille()
  const peutElargir = useMemo(() => etapeElargir(v.filtres, v.zone.selection) !== null, [v.filtres, v.zone.selection])
  const actualisation = libelleActualisation(v.actualiseLe)

  const creer = async (idAvis: string) => {
    try {
      const id = await v.creerAO(idAvis)
      navigate(`/projects/${id}`)
    } catch { /* l'état d'erreur est affiché sur la carte de l'avis */ }
  }

  return (
    <section aria-labelledby="titre-veille" data-veille>
      <h2 id="titre-veille" className="border-b border-bord pb-3 text-lg font-semibold text-fg">Appels d'offres ouverts</h2>
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <RechercheZone selection={v.zone.selection} ville={v.zone.ville} onZone={v.setZone} />
          {/* Colonne collée : la carte entière doit tenir dans la hauteur de l'écran (sinon le sud est coupé tant qu'on descend).
              Largeur max = (hauteur d'écran − 30 rem de recherche, puces et mentions) / 1,09 (rapport hauteur/largeur de la carte), jamais sous 22 rem. */}
          <div className="lg:mx-auto lg:max-w-[max(22rem,calc((100svh_-_30rem)/1.09))]">
            <CarteFrance comptes={v.comptes} selection={v.zone.selection} onSelection={(codes) => v.setZone({ selection: codes, ville: null })} />
          </div>
          <p className="text-[13px] text-fg-3">
            {v.totalComptes > 0 ? `${v.totalComptes} avis ouverts en France` : v.chargeEnCours ? 'Chargement de la carte…' : 'Aucun avis ouvert pour ces filtres'}
            {actualisation ? ` · ${actualisation}` : ''}
            {' · '}Source : {v.source ?? SOURCE_VEILLE}
          </p>
        </div>
        <ListeAvis
          avis={v.avis}
          total={v.total}
          zoneVide={v.zone.selection.length === 0}
          filtres={v.filtres}
          onFiltres={v.setFiltres}
          tri={v.tri}
          onTri={v.setTri}
          metiers={v.metiers}
          nomsDepartements={NOMS}
          aPlus={v.aPlus}
          chargePlus={v.chargePlus}
          onVoirPlus={v.voirPlus}
          enCours={v.avisEnCours || v.chargeEnCours}
          enErreur={v.avisEnErreur}
          peutElargir={peutElargir}
          onElargir={v.elargir}
          onCreerAO={creer}
          creationEnCours={v.creationEnCours}
          creationEnErreurPour={v.creationEnErreurPour}
          source={v.source}
        />
      </div>
    </section>
  )
}
