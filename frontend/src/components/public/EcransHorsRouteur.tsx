import { useEffect, type ReactNode } from 'react'
import { Bouton, classesBouton } from '@/components/ui/bouton'
import { Marque } from './Marque'

const PUBLIQUE = /^\/($|pricing|legal|login|register)/

/** Où mène « Revenir à l'accueil » depuis un écran posé hors du routeur : l'accueil de l'appli, ou le site pour une page publique. */
export function accueilPour(chemin: string): string {
  return PUBLIQUE.test(chemin) ? '/' : '/dashboard'
}

const recharger = () => window.location.reload()

/**
 * Le cadre des écrans posés hors du routeur (erreur, connexion interrompue, nouvelle version) : fond de page, marque, une
 * colonne de lecture, « Recharger » pour seul geste plein (`discret` : au trait, quand l'écran se relève seul).
 */
function CadreHorsRouteur({ titre, phrase, geste, discret, children }: { titre: string; phrase: ReactNode; geste: string; discret?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-surface-page text-fg">
      <header className="conteneur flex min-h-[72px] items-center py-3"><Marque /></header>
      <main className="conteneur flex-1 pb-16 pt-6">
        <div role="alert" className="page-etroite">
          <h1 className="titre-page break-words text-fg">{titre}</h1>
          <p className="mt-2 text-base text-fg-2">{phrase}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {discret
              ? <Bouton variante="secondaire" className="max-sm:w-full" onClick={recharger}>{geste}</Bouton>
              : <Bouton variante="principal" className="max-sm:w-full" onClick={recharger}>{geste}</Bouton>}
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

/** Erreur d'affichage (500) : calme, en français, deux gestes. Rien de technique à l'écran : le détail va à la console. */
export function ErreurAppli() {
  return (
    <CadreHorsRouteur titre="Cet écran n’a pas pu s’afficher" geste="Recharger la page"
      phrase="Une erreur est survenue de notre côté. Vos dossiers et vos documents ne sont pas touchés. Rechargez la page␣; si l’erreur revient, repartez de l’accueil.">
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
      phrase="Synorix n’arrive plus à joindre le réseau. Ce qui est enregistré le reste. Cet écran se rechargera seul dès que la connexion reviendra." />
  )
}

/** Un morceau de l'appli n'a pas pu se charger alors que le réseau répond (nouvelle version en ligne) : on propose de recharger. */
export function MorceauIntrouvable() {
  return (
    <CadreHorsRouteur titre="Une nouvelle version de Synorix est en ligne" geste="Recharger la page"
      phrase="Cet écran a besoin d’être rechargé pour continuer. Ce qui est enregistré le reste." />
  )
}
