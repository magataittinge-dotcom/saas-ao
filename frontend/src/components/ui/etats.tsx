import * as React from 'react'
import { phaseRequete, type RequeteLue } from '@/lib/requete'
import { cn } from '@/lib/utils'
import { Bouton } from './bouton'
import { useAttente } from './squelette'

/**
 * État vide (VEILLE-DESIGN P20) : trois éléments, pas un de plus. Ce qui apparaîtra ici (le titre), quand (une phrase de
 * 14 mots au plus, à la 3ᵉ personne), une seule action dont le verbe répond au titre. Une seule surface par écran vide ; ni
 * icône dans un rond, ni cadre en pointillés, ni compteur « (0) ». Vide PAR FILTRE : `parFiltre` : une autre phrase et
 * « Effacer les filtres », jamais une invitation à créer.
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
    <div data-etat-vide={parFiltre ? 'filtre' : ''} className={cn('rounded-carte border border-bord bg-surface-0 px-6 py-10 text-center shadow-card', className)}>
      <p className="text-lg font-semibold text-fg">{titre}</p>
      {phrase && <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-2">{phrase}</p>}
      {(parFiltre || action) && (
        <div className="mt-5 flex justify-center">
          {parFiltre ? <Bouton variante="secondaire" onClick={parFiltre}>Effacer les filtres</Bouton> : action}
        </div>
      )}
    </div>
  )
}

/**
 * État d'erreur : ce qui n'a pas pu se faire, en mots simples, et le geste pour repartir (« Réessayer »). Jamais une pile
 * d'appels, jamais de l'anglais, jamais le texte de l'état vide. Annoncé aux lecteurs d'écran.
 */
export function EtatErreur({ titre = 'Cette page n’a pas pu se charger', detail = 'La connexion au serveur a échoué. Vos données ne sont pas touchées.', onReessayer, enCours, action, className }: {
  titre?: React.ReactNode
  detail?: React.ReactNode
  onReessayer?: () => void
  enCours?: boolean
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div role="alert" data-etat-erreur="" className={cn('rounded-carte border border-bord bg-surface-0 px-6 py-10 text-center shadow-card', className)}>
      <p className="text-lg font-semibold text-fg">{titre}</p>
      {detail && <p className="mx-auto mt-1.5 max-w-md text-sm text-fg-2">{detail}</p>}
      {(onReessayer || action) && (
        <div className="mt-5 flex justify-center gap-2">
          {onReessayer && <Bouton variante="secondaire" onClick={onReessayer} enCours={enCours} libelleEnCours="Nouvel essai…">Réessayer</Bouton>}
          {action}
        </div>
      )}
    </div>
  )
}

/**
 * Le motif de requête (lib/requete.ts) : chargement → erreur → vide → contenu, dans cet ordre. Pendant le chargement : rien
 * pendant 200 ms, puis `squelette` (aux dimensions du contenu) pendant 400 ms au moins. `aria-busy` sur le conteneur.
 */
export function EtatRequete<T>({ requete, squelette, erreur, vide, estVide, onReessayer, children, className }: {
  requete: RequeteLue<T> & { refetch?: () => unknown; isFetching?: boolean }
  squelette: React.ReactNode
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
  const attente = useAttente(phase === 'chargement')
  const reessayer = onReessayer ?? (requete.refetch ? () => { void requete.refetch?.() } : undefined)
  let contenu: React.ReactNode
  if (phase === 'chargement' || attente !== 'contenu') contenu = attente === 'rien' ? null : squelette
  else if (phase === 'erreur') contenu = erreur ?? <EtatErreur onReessayer={reessayer} enCours={requete.isFetching} />
  else if (phase === 'vide') contenu = vide
  else contenu = children(requete.data as T)
  return <div data-phase={phase} aria-busy={phase === 'chargement' || undefined} className={className}>{contenu}</div>
}
