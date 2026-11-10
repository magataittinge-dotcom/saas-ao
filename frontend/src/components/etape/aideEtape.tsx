import { createContext, useContext } from 'react'
import { LEXIQUE, type EntreeLexique } from '@/lib/lexique'

/**
 * L'aide d'une étape (A4) : trois lignes que le bouton « ? » de l'en-tête déplie DANS l'écran. Ni bulle flottante, ni visite
 * guidée, ni lien d'aide. `sigles` : les sigles présents sur l'écran, développés depuis lib/lexique.ts (une seule source).
 */
export interface AideEtape {
  /** Ce que montre l'écran. */
  montre: string
  /** Ce que vous avez à faire. */
  aFaire: string
  /** Les mots de l'écran. */
  sigles?: EntreeLexique[]
}

/** L'aide par défaut de chaque étape, par segment d'adresse. Une étape peut passer la sienne à `GabaritEtape` (`aide`). */
export const AIDE_ETAPES: Readonly<Record<string, AideEtape>> = {
  upload: {
    montre: 'Les pièces du dossier de l’acheteur que vous avez déposées, chacune avec son type.',
    aFaire: 'Déposez le dossier (ZIP ou PDF), vérifiez le type de chaque pièce, puis lancez la lecture.',
    sigles: [LEXIQUE.DCE, LEXIQUE.RC, LEXIQUE.CCAP, LEXIQUE.CCTP, LEXIQUE.DPGF],
  },
  lots: {
    montre: 'Les lots que Synorix a repérés dans le règlement de la consultation.',
    aFaire: 'Choisissez le lot auquel vous répondez, puis lancez la lecture du dossier.',
    sigles: [LEXIQUE.RC],
  },
  analysis: {
    montre: 'Les conditions du marché relevées dans le dossier, chacune avec sa source : délais, pénalités, paiement, critères de jugement.',
    aFaire: 'Lisez les conditions, ouvrez une source si un point vous arrête, puis décidez de répondre ou non. La décision vous revient.',
    sigles: [LEXIQUE.RC, LEXIQUE.CCAP, LEXIQUE.CCTP],
  },
  verification: {
    montre: 'Les pièces que l’acheteur demande, et celles que votre coffre-fort contient déjà.',
    aFaire: 'Joignez chaque pièce demandée, ou indiquez qu’elle ne vous concerne pas.',
    sigles: [LEXIQUE.DC1, LEXIQUE.DC2, LEXIQUE.DUME],
  },
  plan: {
    montre: 'Le plan proposé pour votre mémoire, bâti sur les critères de jugement du règlement.',
    aFaire: 'Changez l’ordre ou le titre des parties si besoin, puis validez le plan.',
    sigles: [LEXIQUE.RC],
  },
  memoire: {
    montre: 'Le mémoire technique, partie par partie, rédigé à partir du dossier et de Mon entreprise.',
    aFaire: 'Relisez chaque partie, complétez les passages signalés, refaites une partie si elle ne vous convient pas.',
    sigles: [LEXIQUE.CCTP],
  },
  export: {
    montre: 'Le dossier de réponse : le mémoire, les pièces demandées et les formulaires.',
    aFaire: 'Vérifiez que chaque pièce est jointe, téléchargez le dossier, puis déposez-le sur la plateforme de l’acheteur.',
    sigles: [LEXIQUE.DPGF, LEXIQUE.AE],
  },
}

/** La page d'un AO (routes/Project.tsx) publie l'aide de l'étape affichée ; le gabarit la lit. */
export const AideEtapeContexte = createContext<AideEtape | null>(null)
export const useAideEtape = (): AideEtape | null => useContext(AideEtapeContexte)
