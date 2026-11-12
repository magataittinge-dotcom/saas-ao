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
import { heureParis, lireDate } from '@/lib/dateParis'
import { etapeElargir } from '@/lib/veille'

const NOMS: Readonly<Record<string, string>> = Object.fromEntries(DEPARTEMENTS.map((d) => [d.code, d.nom]))

/** « Données BOAMP du 31/10 à 08:12 » (heure de Paris, Q-08) — décision du 1/11 : en petit, à côté de la source. */
export function libelleActualisation(iso: string | null): string | null {
  const d = lireDate(iso)
  if (!d) return null
  const jour = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' }).format(d)
  return `Données BOAMP du ${jour} à ${heureParis(d)}`
}

const JOUR_RELEVE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })

/** Le dernier relevé date de plus de 36 heures : sa date en mots (« 1 novembre ») ; sinon null (la veille est à jour). */
export function releveAncien(iso: string | null, maintenant: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()) || maintenant.getTime() - d.getTime() < 36 * 3600_000) return null
  return JOUR_RELEVE.format(d).replace(/^1 /, '1er ')
}

export default function VeilleAccueil() {
  const navigate = useNavigate()
  const v = useVeille()
  const peutElargir = useMemo(() => etapeElargir(v.filtres, v.zone.selection) !== null, [v.filtres, v.zone.selection])
  const actualisation = libelleActualisation(v.actualiseLe)
  const ancien = releveAncien(v.actualiseLe)

  const creer = async (idAvis: string) => {
    try {
      const id = await v.creerAO(idAvis)
      navigate(`/projects/${id}`)
    } catch { /* l'état d'erreur est affiché sur la carte de l'avis */ }
  }

  return (
    <section aria-labelledby="titre-veille" data-veille>
      {/* L'en-tête : le titre et une phrase, sans point de couleur (une couleur d'état ne va pas sans mot : jury, tour 1). La phrase
          ne promet « chaque matin » que si le dernier relevé est récent ; sinon elle dit la date du relevé, une seule fois. */}
      <TitreSection id="titre-veille">Veille</TitreSection>
      {!v.preferencesEnErreur && (
        <p className="-mt-2 max-w-2xl text-base text-fg-2">
          {ancien
            ? `Synorix surveille les avis ouverts de votre zone. Dernier relevé du BOAMP\u00a0: ${ancien}.`
            : 'Synorix surveille les avis ouverts de votre zone et signale chaque matin les nouveaux.'}
        </p>
      )}

      {v.preferencesEnErreur ? (
        // Les préférences (zone, filtres) n'ont pas pu être lues : rien n'est montré comme vide, rien n'est enregistré.
        <EtatErreur className="mt-6" titre="La veille n’a pas pu se charger" detail={'La connexion a été interrompue. Votre zone et vos filtres ne\u00a0sont\u00a0pas\u00a0touchés.'}
          onReessayer={v.recharger} enCours={v.rechargeEnCours} />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
            <RechercheZone selection={v.zone.selection} ville={v.zone.ville} onZone={v.setZone} />
            {/* Colonne collée, carte à pleine largeur (décision du 1er/11) : sur un écran bas, le sud dépasse de l'écran
                tant qu'on n'a pas défilé ; c'est accepté, la carte n'est plus rétrécie. */}
            <CarteFrance comptes={v.comptes} selection={v.zone.selection} onSelection={(codes) => v.setZone({ selection: codes, ville: null })} />
            {/* le décompte seul : la source est écrite une fois, sous la liste ; la date du relevé, une fois aussi */}
            <p className="text-sm text-fg-3">
              {v.comptesEnErreur
                ? 'Le nombre d’avis par département n’a pas pu se charger'
                : v.totalComptes > 0 ? `${v.totalComptes} avis ouverts en France` : v.chargeEnCours ? '' : 'Aucun avis ouvert pour ces filtres'}
              {actualisation && !ancien && v.totalComptes > 0 ? ` · ${actualisation}` : ''}
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
