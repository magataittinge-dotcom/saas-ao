import { useEffect, type ReactNode } from 'react'
import { WifiOff } from 'lucide-react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { PastilleEtat } from '@/components/ui/pastille'
import { Marque } from './Marque'

const PUBLIQUE = /^\/($|pricing|legal|login|register)/

/** Où mène « Revenir à l'accueil » depuis un écran posé hors du routeur : l'accueil de l'appli, ou le site pour une page publique. */
export function accueilPour(chemin: string): string {
  return PUBLIQUE.test(chemin) ? '/' : '/dashboard'
}

const recharger = () => window.location.reload()

/** L'adresse de contact de l'éditeur (celle des mentions légales). */
const CONTACT = 'contact@synorix.tech'

/**
 * Le cadre des écrans posés hors du routeur (erreur, connexion interrompue, nouvelle version) : fond de page, marque, une
 * colonne de lecture, « Recharger » pour seul geste plein (`discret` : au trait, quand l'écran se relève seul). Sous le
 * titre, le fil d'aurore : la signature de Synorix sans le fond animé (un écran de panne ne dépend de rien d'autre).
 * `etat` : ce que Synorix fait pendant ce temps, avec son signe. `pied` : une ligne sous les gestes (qui joindre).
 */
function CadreHorsRouteur({ titre, phrase, geste, discret, etat, pied, children }: { titre: string; phrase: ReactNode; geste: string; discret?: boolean; etat?: ReactNode; pied?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-surface-page text-fg">
      <header className="conteneur flex min-h-[72px] items-center py-3"><Marque /></header>
      <main className="conteneur flex-1 pb-16 pt-6">
        <div role="alert" className="page-etroite">
          <h1 className="titre-page break-words text-fg">{titre}</h1>
          <span aria-hidden className="fil-aurore mt-4 block" />
          <p className="mt-4 max-w-[60ch] text-base text-fg-2">{phrase}</p>
          {etat}
          <div className="mt-6 flex flex-wrap gap-3">
            {discret
              ? <Bouton variante="secondaire" className="max-sm:w-full" onClick={recharger}>{geste}</Bouton>
              : <Bouton variante="principal" className="max-sm:w-full" onClick={recharger}>{geste}</Bouton>}
            {children}
          </div>
          {pied}
        </div>
      </main>
    </div>
  )
}

/** Erreur d'affichage (500) : calme, en français, deux gestes. Rien de technique à l'écran : le détail va à la console. */
export function ErreurAppli() {
  return (
    <CadreHorsRouteur titre="Cet écran n’a pas pu s’afficher" geste="Recharger la page"
      phrase="Une erreur est survenue de notre côté. Vos dossiers et vos documents ne sont pas touchés."
      pied={<p className="mt-8 text-sm text-fg-2">Si l’erreur revient, écrivez-nous : <a href={`mailto:${CONTACT}`} className="font-medium text-accent-text underline underline-offset-4">{CONTACT}</a></p>}>
      <a href={accueilPour(typeof window === 'undefined' ? '/' : window.location.pathname)} className={classesBouton('secondaire', 'max-sm:w-full')}>Revenir à l’accueil</a>
    </CadreHorsRouteur>
  )
}

/** Hors ligne : l'écran se relève seul dès que le réseau revient (rechargement), sans rien demander. */
export function ConnexionInterrompue() {
  useEffect(() => {
    window.addEventListener('online', recharger)
    return () => window.removeEventListener('online', recharger)
  }, [])
  return (
    <CadreHorsRouteur discret titre="Connexion interrompue" geste="Réessayer maintenant"
      phrase="Synorix n’arrive plus à joindre le réseau. Ce qui est enregistré le reste."
      etat={(
        <p role="status" className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fg-2">
          <PastilleEtat sens="ambre" icone={WifiOff}>Hors connexion</PastilleEtat>
          Synorix guette le retour du réseau : cet écran se rechargera seul.
        </p>
      )} />
  )
}

/** Un morceau de l'appli n'a pas pu se charger alors que le réseau répond (nouvelle version en ligne) : on propose de recharger. */
export function MorceauIntrouvable() {
  return (
    <CadreHorsRouteur titre="Une nouvelle version de Synorix est en ligne" geste="Recharger la page"
      phrase="Cet écran a besoin d’être rechargé pour continuer. Ce qui est enregistré le reste." />
  )
}
