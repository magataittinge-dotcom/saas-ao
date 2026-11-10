import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/authStore'
import { organisationAssezAncienne } from '@/lib/bandeauNouveau'

// Bandeau « Nouveau » : une nouveauté à la fois, fermable ; la fermeture est mémorisée par identifiant
// dans ce navigateur (une nouvelle nouveauté a un nouvel identifiant et revient). Texte sobre, sans point d'exclamation.
// Caché la première semaine de l'organisation (lib/bandeauNouveau.ts), et tant que l'organisation n'est pas chargée.
// Une seule ligne partout : au bureau la phrase entière (tronquée si l'écran est étroit) et son lien ; au téléphone la
// phrase courte, qui est elle-même le lien (refonte groupe A : plus trois lignes au-dessus du titre à 390 px).
const NOUVEAUTE = {
  id: 'source-surlignee-2026-10',
  texte: 'Chaque exigence s’ouvre sur sa source : le passage du dossier de l’acheteur est surligné dans la pièce.',
  // au téléphone : une ligne, une phrase courte lue en entier (jamais tronquée), qui mène au même endroit
  court: 'Sources surlignées dans les pièces',
  lien: { to: '/projects', libelle: 'Ouvrir un appel d’offres' },
}
const CLE = `synorix.bandeau.${NOUVEAUTE.id}`

function dejaFerme(): boolean {
  try { return localStorage.getItem(CLE) === 'ferme' } catch { return false }
}

export default function BandeauNouveau() {
  const organisation = useAuthStore((s) => s.organization)
  return <BandeauSelonAge organisation={organisation} />
}

/** Le bandeau lui-même ; `organisation` à null tant qu'elle n'est pas chargée (rien n'est montré). */
export function BandeauSelonAge({ organisation }: { organisation: { created_at?: string } | null }) {
  const [ferme, setFerme] = useState(dejaFerme)
  if (ferme || organisation === null || organisationAssezAncienne(organisation.created_at) === false) return null
  const fermer = () => {
    setFerme(true)
    try { localStorage.setItem(CLE, 'ferme') } catch { /* stockage indisponible : le bandeau reviendra */ }
  }
  return (
    <div role="region" aria-label="Nouveauté" className="relative flex shrink-0 items-center gap-3 border-b border-bord bg-surface-0 px-3 text-sm text-fg sm:px-6">
      <Badge variant="accent" className="shrink-0">Nouveau</Badge>
      <p className="min-w-0 flex-1 text-fg-2 min-[769px]:truncate max-[768px]:hidden">
        {NOUVEAUTE.texte}{' '}
        <Link to={NOUVEAUTE.lien.to} className="font-semibold text-accent-text underline-offset-2 hover:underline">{NOUVEAUTE.lien.libelle}</Link>
      </p>
      <Link to={NOUVEAUTE.lien.to} className="min-w-0 flex-1 whitespace-nowrap text-sm font-semibold text-accent-text underline-offset-2 hover:underline min-[769px]:hidden">{NOUVEAUTE.court}</Link>
      <button
        type="button"
        onClick={fermer}
        aria-label="Fermer le bandeau"
        className="-mr-2 grid size-11 shrink-0 place-items-center rounded-pilule text-fg-2 transition-colors duration-survol hover:bg-surface-1 hover:text-fg"
      >
        <X size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
      </button>
    </div>
  )
}
