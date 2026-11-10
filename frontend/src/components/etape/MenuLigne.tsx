import { useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Menu, MenuContenu, MenuDeclencheur } from '@/components/ui/menu'

/**
 * Le menu « … » d'un élément : les gestes rares (« Non concerné »…) ne s'affichent pas sur chaque ligne. C'est le menu du
 * système (components/ui/menu.tsx, Radix : Échap, clic ailleurs, flèches, retour du focus). Cible de 44 px.
 * `children` reçoit la fonction qui le referme ; pour un nouveau menu, préférer `MenuPoints` et `MenuElement`.
 */
export function MenuLigne({ libelle, children }: { libelle: string; children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <Menu open={ouvert} onOpenChange={setOuvert}>
      <MenuDeclencheur aria-label={libelle}
        className="grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-colors duration-fast ease-survol hover:bg-surface-1 hover:text-fg active:scale-[.98] data-[state=open]:bg-surface-1 data-[state=open]:text-fg">
        <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden />
      </MenuDeclencheur>
      <MenuContenu aria-label={libelle} className="flex w-56 flex-col">{children(() => setOuvert(false))}</MenuContenu>
    </Menu>
  )
}

export default MenuLigne
