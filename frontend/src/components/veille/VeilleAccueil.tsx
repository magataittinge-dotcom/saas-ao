// Le corps de l'accueil : la veille des appels d'offres. Recherche de zone et carte à gauche, filtres et liste des
// avis à droite. Chargé à la demande par le tableau de bord (React.lazy) : la carte et ses données ne pèsent
// que sur l'accueil. Une lecture en échec dit son erreur (jamais « Choisissez une zone », jamais « aucun avis »).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CarteFrance from './CarteFrance'
import ListeAvis from './ListeAvis'
import RechercheZone from './RechercheZone'
import { DEPARTEMENTS } from './donnees/departements'
import { EtatErreur } from '@/components/ui/etats'
import { TitreSection } from '@/components/ui/page'
import { useVeille } from '@/hooks/useVeille'
import { etapeElargir } from '@/lib/veille'
import { libelleSourceVeille } from '@/services/veille'

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
      {/* L'en-tête : le point turquoise de la veille (COULEURS.md), une phrase. */}
      <TitreSection id="titre-veille"><span aria-hidden className="mr-2.5 inline-block size-2.5 rounded-pilule bg-turquoise-mark align-baseline" />Veille</TitreSection>
      <p className="-mt-2 max-w-2xl text-base text-fg-2">Synorix surveille les avis ouverts de votre zone et signale chaque matin les nouveaux.</p>

      {v.preferencesEnErreur ? (
        // Les préférences (zone, filtres) n'ont pas pu être lues : rien n'est montré comme vide, rien n'est enregistré.
        <EtatErreur className="mt-6" titre="La veille n’a pas pu se charger" detail="La connexion au serveur a échoué. Votre zone et vos filtres ne sont pas touchés."
          onReessayer={v.recharger} enCours={v.rechargeEnCours} />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
            <RechercheZone selection={v.zone.selection} ville={v.zone.ville} onZone={v.setZone} />
            {/* Colonne collée, carte à pleine largeur (décision du 1er/11) : sur un écran bas, le sud dépasse de l'écran
                tant qu'on n'a pas défilé ; c'est accepté, la carte n'est plus rétrécie. */}
            <CarteFrance comptes={v.comptes} selection={v.zone.selection} onSelection={(codes) => v.setZone({ selection: codes, ville: null })} />
            <p className="text-sm text-fg-3">
              {v.comptesEnErreur
                ? 'Le nombre d’avis par département n’a pas pu se charger'
                : v.totalComptes > 0 ? `${v.totalComptes} avis ouverts en France` : v.chargeEnCours ? 'Chargement de la carte…' : 'Aucun avis ouvert pour ces filtres'}
              {actualisation ? ` · ${actualisation}` : ''}
              {' · '}Source : {libelleSourceVeille(v.source)}
            </p>
          </div>
          <ListeAvis
            avis={v.avis}
            total={v.total}
            zoneVide={v.zone.selection.length === 0 && !v.chargeEnCours}
            preferencesEnLecture={v.chargeEnCours}
            filtres={v.filtres}
            onFiltres={v.setFiltres}
            tri={v.tri}
            onTri={v.setTri}
            metiers={v.metiers}
            nomsDepartements={NOMS}
            zone={v.zone.selection}
            aPlus={v.aPlus}
            chargePlus={v.chargePlus}
            onVoirPlus={v.voirPlus}
            enCours={v.avisEnCours || v.chargeEnCours}
            enErreur={v.avisEnErreur}
            onReessayer={v.rechargerAvis}
            peutElargir={peutElargir}
            onElargir={v.elargir}
            onCreerAO={creer}
            creationEnCours={v.creationEnCours}
            creationEnErreurPour={v.creationEnErreurPour}
            source={v.source}
          />
        </div>
      )}
    </section>
  )
}
