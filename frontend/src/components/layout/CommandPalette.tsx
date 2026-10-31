import { LEXIQUE } from '@/lib/lexique'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, Briefcase, Building2, Archive, Calculator,
  Users, Settings, CreditCard, Plus, FileText,
} from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { useProjects } from '@/hooks/useProject'
import { estEnCours } from '@/lib/echeance'

const PAGES = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/projects',         icon: FolderOpen,      label: 'Mes AO' },
  { to: '/company',          icon: Briefcase,       label: 'Mon entreprise' },
  { to: '/references',       icon: Building2,       label: 'Mes références' },
  { to: '/vault',            icon: Archive,         label: 'Coffre-fort' },
  { to: '/outils',           icon: Calculator,      label: 'Retenue de garantie' },
  { to: '/team',             icon: Users,           label: 'Équipe' },
  { to: '/settings',         icon: Settings,        label: 'Paramètres' },
  { to: '/settings/billing', icon: CreditCard,      label: 'Abonnement' },
]

/** Raccourci affiché : ⌘K sur Mac, Ctrl K ailleurs. */
export const RACCOURCI_PALETTE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Palette ⌘K : aller à un appel d'offres ou à une page au clavier.
 * Les AO en cours d'abord, puis les autres ; la recherche porte sur le nom
 * et l'acheteur.
 */
export default function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const { data: projects = [] } = useProjects()

  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', raccourci)
    return () => window.removeEventListener('keydown', raccourci)
  }, [open, onOpenChange])

  const aller = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  const tries = [...projects].sort((a, b) => Number(estEnCours(b.status)) - Number(estEnCours(a.status)))

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Rechercher un appel d'offres, une page…" />
      <CommandList className="max-h-[min(420px,60vh)]">
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        {tries.length > 0 && (
          <CommandGroup heading="Appels d'offres">
            {tries.map((p) => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.maitre_ouvrage ?? ''} ${p.id}`}
                onSelect={() => aller(`/projects/${p.id}`)}
              >
                <FileText className="text-encre-4" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.maitre_ouvrage && (
                  <span className="ml-3 max-w-[40%] shrink-0 truncate text-xs text-encre-3">{p.maitre_ouvrage}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Aller à">
          <CommandItem value={`Nouvel AO déposer un dossier ${LEXIQUE.DCE.sigle}`} onSelect={() => aller('/projects/new')}>
            <Plus className="text-encre-4" />
            Nouvel AO
          </CommandItem>
          {PAGES.map((page) => (
            <CommandItem key={page.to} value={page.label} onSelect={() => aller(page.to)}>
              <page.icon className="text-encre-4" />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
