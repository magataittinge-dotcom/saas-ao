import type { ReactNode } from 'react'
import { EtatElement } from '@/components/etape'
import { etatDeStatut } from '@/lib/resumePieces'
import type { StatutPiece } from '@/lib/statutPiece'

/**
 * Les pièces d'une étape, en LISTE (jury, tour 1 : « une liste de contrôle de 16 pièces dessinée en 16 cartes sur deux
 * colonnes », des cartes orphelines, des états qui ne sont pas à la même hauteur d'une carte à sa voisine) : une surface au
 * trait par famille de pièces, une ligne par pièce : le nom et ce qu'il faut en savoir à gauche ; l'état, LE geste de la ligne
 * et son menu à droite, toujours aux mêmes abscisses.
 */
export function ListePieces({ children }: { children: ReactNode }) {
  return <div data-liste-pieces="" className="divide-y divide-bord rounded-carte border border-bord bg-surface-0">{children}</div>
}

/** Les états qui ne demandent rien de plus que la consigne de l'écran : dits en texte neutre, sans icône ni couleur. */
const ETATS_NEUTRES = new Set(['a-joindre', 'si-concerne', 'facultatif', 'attribution', 'non-concerne'])

/**
 * L'état d'une pièce. Seule l'exception est marquée (une icône, un mot, la couleur de l'état) : « Prêt », « À renouveler »,
 * « Date de validité à confirmer ». « À joindre », répété sur presque toutes les lignes, est un texte neutre : le bleu est la
 * couleur de l'action, pas un état, et un état écrit quatorze fois ne distingue rien.
 */
export function EtatDePiece({ statut, texte }: { statut: StatutPiece; texte?: string }) {
  if (ETATS_NEUTRES.has(statut.code)) return <span data-etat={statut.code} className="whitespace-nowrap text-sm text-fg-2">{texte ?? statut.texte}</span>
  const { etat, perimee } = etatDeStatut(statut)
  return <EtatElement etat={etat} texte={texte ?? statut.texte} perimee={perimee} />
}

export function LignePiece({ id, nom, sous, etat, actions, menu, pied }: {
  id: string
  nom: ReactNode
  /** Sous le nom : le fichier joint, le modèle à compléter, la signature, la source… */
  sous?: ReactNode
  etat: ReactNode
  /** LE geste de la ligne (« Choisir », « Déposer le formulaire rempli »). */
  actions?: ReactNode
  menu?: ReactNode
  /** Sous la ligne : un message d'échec de ce geste. */
  pied?: ReactNode
}) {
  return (
    <div data-piece={id} className="px-5 py-3 max-sm:px-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="min-w-0 flex-1 basis-72 py-1">
          <p className="break-words font-semibold text-fg">{nom}</p>
          {sous}
        </div>
        <div className="flex min-w-0 items-center justify-between gap-x-3 max-sm:basis-full">
          <div className="min-w-0 sm:w-56">{etat}</div>
          <div className="flex min-w-0 items-center justify-end gap-1 sm:w-64 sm:shrink-0">
            {actions}
            {menu ?? <span aria-hidden="true" className="size-11 shrink-0" />}
          </div>
        </div>
      </div>
      {pied && <div className="mt-2">{pied}</div>}
    </div>
  )
}

export default LignePiece
