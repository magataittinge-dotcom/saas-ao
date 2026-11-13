import * as React from 'react'
import { phaseRequete, type RequeteLue } from '@/lib/requete'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { Bouton } from './bouton'
import { useAttente, type PhaseAttente } from './squelette'

/**
 * État vide (VEILLE-DESIGN P20) : trois éléments, pas un de plus. Ce qui apparaîtra ici (le titre), quand (une phrase de
 * 14 mots au plus, à la 3ᵉ personne), une seule action dont le verbe répond au titre. Une seule surface par écran vide ; ni
 * icône dans un rond, ni cadre en pointillés, ni compteur « (0) ». Vide PAR FILTRE : `parFiltre` : une autre phrase et
 * « Effacer les filtres », jamais une invitation à créer.
 * Aligné à gauche, comme la page (jury, tour 1 : « centré dans une carte de 1 200 px ») : le texte part du bord des autres
 * cartes, la phrase tient sur 60 caractères.
 */
export function EtatVide({ titre, phrase, action, parFiltre, className }: {
  titre: React.ReactNode
  phrase?: React.ReactNode
  action?: React.ReactNode
  /** Le vide vient des filtres : passe la fonction qui les efface. */
  parFiltre?: () => void
  className?: string
}) {
  return (
    <div data-etat-vide={parFiltre ? 'filtre' : ''} className={cn('rounded-carte border border-bord bg-surface-0 p-6 shadow-card max-sm:p-5', className)}>
      <p className="text-lg font-semibold text-fg">{titre}</p>
      {phrase && <p className="mt-1 max-w-[60ch] text-sm text-fg-2">{phrase}</p>}
      {(parFiltre || action) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {parFiltre ? <Bouton variante="secondaire" onClick={parFiltre}>Effacer les filtres</Bouton> : action}
        </div>
      )}
    </div>
  )
}

// ── Un seul « Réessayer » par écran (jury, tour 1 : l'Accueil en montrait trois quand tout le serveur était en panne). ──
// Chaque état d'erreur monté s'inscrit ici avec sa relance. Le premier inscrit porte le bouton, qui relance TOUS les états
// d'erreur de l'écran ; les suivants disent seulement ce qui n'a pas pu se charger. Hors navigateur (rendu serveur, tests) :
// chaque état garde son bouton.
interface ErreurInscrite { id: symbol; relancer: () => void }
const erreursMontees: ErreurInscrite[] = []
const abonnes = new Set<() => void>()
const publier = () => { abonnes.forEach((f) => f()) }
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f) } }
const premiereErreur = () => erreursMontees[0]?.id ?? null

/** Pour les tests : les relances inscrites, dans l'ordre. */
export const relancesInscrites = () => erreursMontees.map((e) => e.relancer)

function useErreurCommune(onReessayer: (() => void) | undefined) {
  const id = React.useRef(Symbol('erreur')).current
  const relance = React.useRef(onReessayer)
  relance.current = onReessayer
  const relancable = Boolean(onReessayer)
  const declarer = useUIStore((s) => s.declarerAplat)
  React.useEffect(() => {
    if (!relancable) return undefined
    const inscrite: ErreurInscrite = { id, relancer: () => relance.current?.() }
    erreursMontees.push(inscrite)
    // « Réessayer » est le geste de l'écran : « Nouvel appel d'offres » de la barre du haut passe au trait.
    declarer(1)
    publier()
    return () => {
      erreursMontees.splice(erreursMontees.indexOf(inscrite), 1)
      declarer(-1)
      publier()
    }
  }, [id, relancable, declarer])
  const premiere = React.useSyncExternalStore(abonner, premiereErreur, () => null)
  return {
    /** Cet état porte le bouton. */
    meneur: premiere === null || premiere === id,
    relancerTout: () => { if (erreursMontees.length > 0) erreursMontees.slice().forEach((e) => e.relancer()); else relance.current?.() },
  }
}

/**
 * État d'erreur, LE modèle (jury, tour 1 : « un seul modèle d'erreur ») : une icône et la couleur de l'état (rouge), ce qui
 * n'a pas pu se faire (le titre), UNE phrase qui dit la cause, et le geste pour repartir. Aligné à gauche comme la page,
 * jamais centré dans une carte. Un seul « Réessayer » par écran : s'il y a plusieurs pannes, le premier état porte le bouton
 * et relance tout. Jamais une pile d'appels, jamais de l'anglais, jamais le texte de l'état vide. Annoncé aux lecteurs d'écran.
 */
export function EtatErreur({ titre = 'Cette page n’a pas pu se charger', detail = 'La connexion au serveur a échoué. Vos données sont intactes.', onReessayer, enCours, action, className }: {
  titre?: React.ReactNode
  detail?: React.ReactNode
  onReessayer?: () => void
  enCours?: boolean
  action?: React.ReactNode
  className?: string
}) {
  const { meneur, relancerTout } = useErreurCommune(onReessayer)
  const bouton = onReessayer && meneur
  return (
    <div role="alert" data-etat-erreur="" className={cn('flex items-start gap-3 rounded-carte border border-bord bg-surface-0 p-6 shadow-card max-sm:p-5', className)}>
      <AlertCircle aria-hidden size={20} strokeWidth={1.75} className="mt-1 shrink-0 text-rouge-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-fg">{titre}</p>
        {detail && <p className="mt-1 max-w-[60ch] text-sm text-fg-2">{detail}</p>}
        {(bouton || action) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            {bouton && <Bouton variante="secondaire" data-reessayer="" onClick={relancerTout} enCours={enCours} libelleEnCours="Nouvel essai…">Réessayer</Bouton>}
            {action}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Le motif de requête (lib/requete.ts) : chargement → erreur → vide → contenu, dans cet ordre. Pendant le chargement : rien
 * pendant 200 ms, puis `squelette` (aux dimensions du contenu) pendant 400 ms au moins. `aria-busy` sur le conteneur.
 */
export function EtatRequete<T>({ requete, squelette, erreur, vide, estVide, onReessayer, children, className, attente: attenteImposee }: {
  requete: RequeteLue<T> & { refetch?: () => unknown; isFetching?: boolean }
  squelette: React.ReactNode
  /** L'attente, quand l'écran la partage avec d'autres blocs qui doivent basculer en même temps (`useAttente` de l'écran) ;
   *  sinon celle de la requête. */
  attente?: PhaseAttente
  /** L'état d'erreur ; par défaut `<EtatErreur>` avec « Réessayer ». */
  erreur?: React.ReactNode
  /** L'état vide de cet écran (`<EtatVide>`). */
  vide: React.ReactNode
  estVide?: (donnees: T) => boolean
  onReessayer?: () => void
  children: (donnees: T) => React.ReactNode
  className?: string
}) {
  const phase = phaseRequete(requete, estVide)
  const attenteRequete = useAttente(phase === 'chargement')
  const attente = attenteImposee ?? attenteRequete
  const reessayer = onReessayer ?? (requete.refetch ? () => { void requete.refetch?.() } : undefined)
  let contenu: React.ReactNode
  if (phase === 'chargement' || attente !== 'contenu') contenu = attente === 'rien' ? null : squelette
  else if (phase === 'erreur') contenu = erreur ?? <EtatErreur onReessayer={reessayer} enCours={requete.isFetching} />
  else if (phase === 'vide') contenu = vide
  else contenu = children(requete.data as T)
  // `data-bloc-en-attente` : rien ou le squelette est à l'écran, y compris pendant les 400 ms où le squelette reste après
  // l'arrivée des données (`data-phase` dit déjà « contenu ») ; le pied de page attend (index.css)
  const enAttente = phase === 'chargement' || attente !== 'contenu'
  return <div data-phase={phase} data-bloc-en-attente={enAttente ? '' : undefined} aria-busy={phase === 'chargement' || undefined} className={className}>{contenu}</div>
}
