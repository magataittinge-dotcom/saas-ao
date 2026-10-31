import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// Bandeau « Nouveau » : une nouveauté à la fois, fermable ; la fermeture est mémorisée par identifiant
// dans ce navigateur (une nouvelle nouveauté a un nouvel identifiant et revient). Texte sobre, sans point d'exclamation.
const NOUVEAUTE = {
  id: 'source-surlignee-2026-10',
  texte: 'Chaque exigence s’ouvre sur sa source : le passage du dossier de l’acheteur est surligné dans la pièce.',
  lien: { to: '/projects', libelle: 'Ouvrir un appel d’offres' },
}
const CLE = `synorix.bandeau.${NOUVEAUTE.id}`

function dejaFerme(): boolean {
  try { return localStorage.getItem(CLE) === 'ferme' } catch { return false }
}

export default function BandeauNouveau() {
  const [ferme, setFerme] = useState(dejaFerme)
  if (ferme) return null
  const fermer = () => {
    setFerme(true)
    try { localStorage.setItem(CLE, 'ferme') } catch { /* stockage indisponible : le bandeau reviendra */ }
  }
  return (
    <div role="region" aria-label="Nouveauté" className="flex shrink-0 items-center gap-3 border-b border-bord bg-accent-tint px-3 py-1.5 text-sm text-fg sm:px-6">
      <Badge variant="accent" className="shrink-0">Nouveau</Badge>
      <p className="min-w-0 flex-1 truncate max-[768px]:line-clamp-2 max-[768px]:whitespace-normal max-[768px]:text-[13px] max-[768px]:leading-snug">
        {NOUVEAUTE.texte}{' '}
        <Link to={NOUVEAUTE.lien.to} className="font-medium text-accent-text underline-offset-2 hover:underline max-[768px]:hidden">{NOUVEAUTE.lien.libelle}</Link>
      </p>
      <button
        type="button"
        onClick={fermer}
        aria-label="Fermer le bandeau"
        className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-colors duration-base hover:bg-surface-1 hover:text-fg"
      >
        <X size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
      </button>
    </div>
  )
}
