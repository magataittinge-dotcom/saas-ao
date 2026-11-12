import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { BoutonIcone } from '@/components/ui/bouton'
import { useAuthStore } from '@/stores/authStore'
import { fermerNouveaute, NOUVEAUTE, nouveauteFermee, nouveauteVisible } from '@/lib/bandeauNouveau'

/**
 * La ligne « Nouveau » : une annonce du produit, pas le travail du jour (jury, tour 1 : elle occupait 65 px entre le titre de
 * l'Accueil et le premier contenu). Elle est sortie du flux : elle vit au pied du panneau des notifications, en une phrase,
 * un lien, une croix. Congédiée, elle ne revient pas dans ce navigateur (lib/bandeauNouveau.ts).
 */
export function LigneNouveau({ onSuivre }: { onSuivre?: () => void }) {
  const organisation = useAuthStore((s) => s.organization)
  return <LigneNouveauSelonAge organisation={organisation} onSuivre={onSuivre} />
}

/** La ligne elle-même ; `organisation` à null tant qu'elle n'est pas chargée (rien n'est montré). */
export function LigneNouveauSelonAge({ organisation, onSuivre }: { organisation: { created_at?: string } | null; onSuivre?: () => void }) {
  const [fermee, setFermee] = useState(nouveauteFermee)
  if (!nouveauteVisible(organisation, fermee)) return null
  const fermer = () => { setFermee(true); fermerNouveaute() }
  return (
    <div data-ligne-nouveau="" className="flex items-start gap-1 border-t border-bord py-2 pl-4 pr-1">
      <p className="min-w-0 flex-1 py-1.5 text-xs text-fg-2">
        <span className="font-semibold text-fg">Nouveau</span>{' · '}{NOUVEAUTE.texte}{' '}
        <Link to={NOUVEAUTE.lien.to} onClick={onSuivre} className="whitespace-nowrap font-semibold text-accent-text underline-offset-2 hover:underline">{NOUVEAUTE.lien.libelle}</Link>
      </p>
      <BoutonIcone libelle="Fermer le bandeau" onClick={fermer}><X aria-hidden strokeWidth={1.5} /></BoutonIcone>
    </div>
  )
}

export default LigneNouveau
