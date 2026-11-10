import * as React from 'react'
import * as M from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeEcran } from '@/lib/themeEcran'

/**
 * LE menu du système (Radix : flèches, Échap, frappe au clavier, retour du focus). Surface flottante, rayon 14, éléments de
 * 44 px ; au survol et au clavier : fond `--surface-1`. Ouverture : 180 ms, opacité et échelle. `MenuPoints` : le menu « … »
 * d'une rangée (les gestes rares ne s'affichent pas sur chaque ligne).
 */
export const Menu = M.Root
export const MenuDeclencheur = M.Trigger

export function MenuContenu({ className, sideOffset = 6, align = 'end', ...props }: React.ComponentPropsWithoutRef<typeof M.Content>) {
  const theme = useThemeEcran()
  return (
    <M.Portal>
      <M.Content data-theme={theme} sideOffset={sideOffset} align={align} collisionPadding={12}
        className={cn('menu-flottant z-50 min-w-48 rounded-lg border border-bord bg-surface-pop p-1 text-fg shadow-flottant', className)} {...props} />
    </M.Portal>
  )
}

export const classeElementMenu = 'flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium text-fg outline-none transition-colors duration-fast ease-survol data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-1 data-[disabled]:text-fg-disabled'

export function MenuElement({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(classeElementMenu, danger && 'text-rouge-ink', className)} {...props} />
}
export function MenuSeparateur() { return <M.Separator className="my-1 h-px bg-bord" /> }
export function MenuTitre({ children }: { children: React.ReactNode }) { return <M.Label className="px-3 pb-1 pt-1.5 text-xs font-medium text-fg-3">{children}</M.Label> }

/** Le menu « … » d'une rangée : un bouton de 44 px et ses éléments. */
export function MenuPoints({ libelle, children, className }: { libelle: string; children: React.ReactNode; className?: string }) {
  return (
    <Menu>
      <MenuDeclencheur aria-label={libelle}
        className={cn('grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-colors duration-fast ease-survol hover:bg-surface-1 hover:text-fg active:scale-[.98] data-[state=open]:bg-surface-1 data-[state=open]:text-fg', className)}>
        <MoreHorizontal aria-hidden size={18} strokeWidth={1.5} />
      </MenuDeclencheur>
      <MenuContenu>{children}</MenuContenu>
    </Menu>
  )
}
