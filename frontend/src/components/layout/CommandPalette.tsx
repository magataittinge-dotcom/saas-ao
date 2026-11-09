import { LEXIQUE } from '@/lib/lexique'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, ArrowRight } from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { useProjects } from '@/hooks/useProject'
import { estEnCours } from '@/lib/echeance'
import { lienEtape, verbeEtape } from '@/lib/intelligence/action'
import { acheteurCourt } from '@/lib/mesAO'
import { ACCES_PALETTE } from './navigation'

/** Raccourci affiché : ⌘K sur Mac, Ctrl K ailleurs. */
export const RACCOURCI_PALETTE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Palette ⌘K : aller à un appel d'offres ou à une page au clavier.
 * Les AO en cours d'abord, avec le verbe de leur prochaine action à droite (actionEtape) : Entrée mène à l'écran de cette
 * action ; puis les autres AO (leur page). La recherche porte sur le nom et l'acheteur. Icônes au trait, sans rond.
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

  const enCours = projects.filter((p) => estEnCours(p.status))
  const autres = projects.filter((p) => !estEnCours(p.status))

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Rechercher un appel d'offres, une page…" />
      <CommandList className="max-h-[min(440px,60vh)] pb-1.5">
        <CommandEmpty>Aucun résultat pour cette recherche.</CommandEmpty>
        {enCours.length > 0 && (
          <CommandGroup heading="En cours">
            {enCours.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.maitre_ouvrage ?? ''} ${p.id}`} onSelect={() => aller(lienEtape(p))}>
                <FileText strokeWidth={1.8} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  {p.maitre_ouvrage && <span className="block truncate text-[13px] text-fg-3 max-sm:hidden">{acheteurCourt(p.maitre_ouvrage)}</span>}
                  <span className="block truncate text-[13px] font-semibold text-accent-text sm:hidden">{verbeEtape(p)}</span>
                </span>
                <span className="ml-3 flex max-w-[45%] shrink-0 items-center gap-1.5 text-[13px] font-semibold text-accent-text max-sm:hidden">
                  <span className="truncate">{verbeEtape(p)}</span><ArrowRight strokeWidth={1.8} className="!text-accent-text" />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {autres.length > 0 && (
          <CommandGroup heading="Autres appels d'offres">
            {autres.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.maitre_ouvrage ?? ''} ${p.id}`} onSelect={() => aller(`/projects/${p.id}`)}>
                <FileText strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.maitre_ouvrage && <span className="ml-3 max-w-[40%] shrink-0 truncate text-[13px] text-fg-3">{acheteurCourt(p.maitre_ouvrage)}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Aller à">
          <CommandItem value={`Nouvel AO déposer un dossier ${LEXIQUE.DCE.sigle}`} onSelect={() => aller('/projects/new')}>
            <Plus strokeWidth={1.8} />
            Nouvel AO
          </CommandItem>
          {ACCES_PALETTE.map((page) => (
            <CommandItem key={page.to} value={page.label} onSelect={() => aller(page.to)}>
              <page.icon strokeWidth={1.8} />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
