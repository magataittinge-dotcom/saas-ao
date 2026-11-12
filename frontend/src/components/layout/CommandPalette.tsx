import { LEXIQUE } from '@/lib/lexique'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, ArrowRight } from 'lucide-react'
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import { Bouton } from '@/components/ui/bouton'
import { useProjects } from '@/hooks/useProject'
import { aoDansEtat, lectureAO, lienAO } from '@/lib/etatAO'
import { acheteurCourt } from '@/lib/mesAO'
import { scorePalette } from '@/lib/recherchePalette'
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
  const { data: projects = [], isError: aoEnErreur } = useProjects()
  const [saisie, setSaisie] = useState('')
  useEffect(() => { if (!open) setSaisie('') }, [open])
  const cherche = saisie.trim()

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

  // les mêmes états que l'Accueil et Mes AO (lib/etatAO.ts) : une remise passée n'est plus « en cours »
  const enCours = aoDansEtat(projects, 'en_cours')
  const aMettreAJour = aoDansEtat(projects, 'a_mettre_a_jour')
  const autres = aoDansEtat(projects, 'termine')

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} filter={scorePalette}>
      <CommandInput placeholder="Rechercher un AO, une page…" value={saisie} onValueChange={setSaisie} />
      <CommandList className="max-h-[min(440px,60vh)] min-h-40 pb-1.5">
        {/* les mêmes mots que la recherche de Mes AO, alignés à gauche comme le reste du panneau */}
        <CommandEmpty className="px-5 pb-2 pt-5 text-left text-sm text-fg-2">
          {aoEnErreur
            ? <>Vos appels d’offres n’ont pas pu se charger. Aucune page ne contient {`«\u00a0${cherche}\u00a0».`}</>
            : <>Aucun appel d’offres ni page ne contient {`«\u00a0${cherche}\u00a0».`}</>}
        </CommandEmpty>
        {enCours.length > 0 && (
          <CommandGroup heading="En cours">
            {enCours.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.maitre_ouvrage ?? ''} ${p.selected_lot_name ?? ''} ${p.id}`} onSelect={() => aller(lienAO(p))}>
                <FileText strokeWidth={1.8} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  {p.maitre_ouvrage && <span className="block truncate text-sm text-fg-3 max-sm:hidden">{acheteurCourt(p.maitre_ouvrage)}</span>}
                  <span className="block truncate text-sm font-semibold text-accent-text sm:hidden">{lectureAO(p).action.verbe}</span>
                </span>
                <span className="ml-3 flex max-w-[45%] shrink-0 items-center gap-1.5 text-sm font-semibold text-accent-text max-sm:hidden">
                  <span className="truncate">{lectureAO(p).action.verbe}</span><ArrowRight strokeWidth={1.8} className="!text-accent-text" />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {aMettreAJour.length > 0 && (
          <CommandGroup heading={'À mettre à jour\u00a0: dire ce qu’ils sont devenus'}>
            {aMettreAJour.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.maitre_ouvrage ?? ''} ${p.selected_lot_name ?? ''} ${p.id}`} onSelect={() => aller(lienAO(p))}>
                <FileText strokeWidth={1.8} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  {(p.maitre_ouvrage || p.selected_lot_name) && <span className="block truncate text-sm text-fg-3">{[acheteurCourt(p.maitre_ouvrage), p.selected_lot_name].filter(Boolean).join(' · ')}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {autres.length > 0 && (
          <CommandGroup heading="Terminés">
            {autres.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.maitre_ouvrage ?? ''} ${p.selected_lot_name ?? ''} ${p.id}`} onSelect={() => aller(`/projects/${p.id}`)}>
                <FileText strokeWidth={1.8} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.maitre_ouvrage && <span className="ml-3 max-w-[40%] shrink-0 truncate text-sm text-fg-3">{acheteurCourt(p.maitre_ouvrage)}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Aller à">
          <CommandItem value={`Nouvel AO nouvel appel d’offres déposer un dossier ${LEXIQUE.DCE.sigle}`} onSelect={() => aller('/projects/new')}>
            <Plus strokeWidth={1.8} />
            Nouvel appel d’offres
          </CommandItem>
          {ACCES_PALETTE.map((page) => (
            <CommandItem key={page.to} value={page.label} onSelect={() => aller(page.to)}>
              <page.icon strokeWidth={1.8} />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {/* une recherche sans réponse garde un geste : cette ligne reste quoi qu'on tape */}
        {cherche !== '' && (
          <CommandGroup forceMount heading="Sinon">
            <CommandItem forceMount value="geste-nouvel-appel-d-offres" onSelect={() => aller('/projects/new')}>
              <Plus strokeWidth={1.8} />
              Déposer un nouvel appel d’offres
            </CommandItem>
            <CommandItem forceMount value="geste-avis-de-la-veille" onSelect={() => aller('/dashboard')}>
              <ArrowRight strokeWidth={1.8} />
              Chercher dans les avis de la veille
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
      {/* le pied : l'aide du clavier au bureau, « Fermer » au téléphone (jury, tour 1 : ni l'un ni l'autre) */}
      <div data-pied-palette="" className="flex min-h-11 items-center justify-between gap-4 border-t border-bord px-4 text-xs text-fg-3">
        <p className="flex items-center gap-4 max-sm:hidden">
          <span><kbd className="font-sans font-semibold text-fg-2">↑ ↓</kbd> choisir</span>
          <span><kbd className="font-sans font-semibold text-fg-2">Entrée</kbd> ouvrir</span>
          <span><kbd className="font-sans font-semibold text-fg-2">Échap</kbd> fermer</span>
        </p>
        <Bouton variante="lien" onClick={() => onOpenChange(false)} className="ml-auto sm:hidden">Fermer</Bouton>
      </div>
    </CommandDialog>
  )
}
