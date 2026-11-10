import * as React from 'react'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeEcran } from '@/lib/themeEcran'
import { Bouton } from './bouton'

/**
 * LE dialogue du système (un seul : plus de `createPortal` à la main). Radix fournit le piège de focus, Échap, le clic sur le
 * voile et le retour du focus. Titre 17 px / 600, une phrase d'explication, le contenu, puis les actions à droite (l'action
 * qui confirme à droite, « Annuler » à sa gauche ; empilées, pleine largeur, au téléphone). Ouverture : 280 ms, opacité et
 * échelle .98 → 1 ; fermeture : 100 ms. Voile sans flou. Un dialogue ne s'emploie que pour interrompre ou protéger un geste.
 */
export function Dialogue({ ouvert, onOuvert, titre, description, children, actions, taille = 'moyen', sansFermer, className }: {
  ouvert: boolean
  onOuvert: (ouvert: boolean) => void
  titre: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  /** Les boutons, dans l'ordre de lecture : secondaire(s), puis l'action qui confirme. */
  actions?: React.ReactNode
  taille?: 'petit' | 'moyen' | 'grand'
  /** Sans la croix (une confirmation : « Annuler » suffit). */
  sansFermer?: boolean
  className?: string
}) {
  const theme = useThemeEcran()
  return (
    <D.Root open={ouvert} onOpenChange={onOuvert}>
      <D.Portal>
        <D.Overlay data-theme={theme} className="voile-flottant fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-voile p-4 max-[768px]:place-items-end max-[768px]:p-0">
          <D.Content data-dialogue="" {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn('dialogue-flottant relative grid w-full gap-4 rounded-carte border border-bord bg-surface-pop p-6 text-fg shadow-flottant max-[768px]:flex max-[768px]:max-h-[calc(100dvh-1rem)] max-[768px]:flex-col max-[768px]:rounded-b-none max-[768px]:pb-[max(1.5rem,env(safe-area-inset-bottom))]',
              taille === 'petit' ? 'max-w-md' : taille === 'grand' ? 'max-w-3xl' : 'max-w-lg', className)}>
            <div className={cn('grid gap-1.5 max-[768px]:shrink-0', !sansFermer && 'pr-10')}>
              <D.Title className="text-lg font-semibold text-fg">{titre}</D.Title>
              {description && <D.Description className="text-sm text-fg-2">{description}</D.Description>}
            </div>
            {/* au téléphone, le contenu seul défile (une longue liste ne pousse ni le titre ni les actions hors de l'écran) */}
            {children != null && children !== false && <div data-dialogue-corps="" className="contents max-[768px]:-mx-6 max-[768px]:grid max-[768px]:min-h-0 max-[768px]:flex-1 max-[768px]:gap-4 max-[768px]:overflow-y-auto max-[768px]:overscroll-contain max-[768px]:px-6">{children}</div>}
            {actions && <div data-dialogue-actions="" className="flex flex-wrap justify-end gap-2 pt-1 max-[768px]:shrink-0 max-[768px]:flex-col-reverse max-[768px]:[&>*]:w-full">{actions}</div>}
            {!sansFermer && (
              <D.Close aria-label="Fermer" className="absolute right-2 top-2 grid size-11 place-items-center rounded-pilule text-fg-2 transition-colors duration-fast ease-survol hover:bg-surface-1 hover:text-fg active:scale-[.98]">
                <X aria-hidden size={18} strokeWidth={1.5} />
              </D.Close>
            )}
          </D.Content>
        </D.Overlay>
      </D.Portal>
    </D.Root>
  )
}

/**
 * Une confirmation : la question en titre, la conséquence en une phrase, « Annuler » et le verbe de l'action. `danger` : le
 * bouton qui confirme est au trait rouge (jamais un aplat). En cours : son libellé change, il se désactive. Remplace `confirm(`.
 */
export function DialogueConfirmation({ ouvert, onOuvert, titre, description, libelleConfirmer, libelleAnnuler = 'Annuler', libelleEnCours, onConfirmer, danger, enCours, erreur, children }: {
  ouvert: boolean
  onOuvert: (ouvert: boolean) => void
  titre: React.ReactNode
  description?: React.ReactNode
  libelleConfirmer: string
  libelleAnnuler?: string
  libelleEnCours?: string
  onConfirmer: () => void
  danger?: boolean
  enCours?: boolean
  erreur?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Dialogue ouvert={ouvert} onOuvert={(o) => { if (!enCours) onOuvert(o) }} titre={titre} description={description} taille="petit" sansFermer
      actions={<>
        <Bouton variante="secondaire" onClick={() => onOuvert(false)} disabled={enCours}>{libelleAnnuler}</Bouton>
        <Bouton variante={danger ? 'danger' : 'principal'} onClick={onConfirmer} enCours={enCours} libelleEnCours={libelleEnCours}>{libelleConfirmer}</Bouton>
      </>}>
      {children}
      {erreur && <p role="alert" className="text-sm font-medium text-rouge-ink">{erreur}</p>}
    </Dialogue>
  )
}
