import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { Champ } from '@/components/ui/champ'
import { authService } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'

/**
 * Première action d'un profil vide : le SIRET, rien d'autre. Le répertoire Sirene remplit ensuite l'identité
 * (raison sociale, forme juridique, adresse, activité) ; la page complète revient d'elle-même.
 * Même validation que l'accueil du premier DCE : `/auth/sync`, un SIRET invalide ou déjà pris est expliqué, jamais bloquant.
 */
export default function CommencerParSiret({ onPasser }: { onPasser?: () => void }) {
  const setOrganization = useAuthStore((s) => s.setOrganization)
  const client = useQueryClient()
  const [siret, setSiret] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const valider = async () => {
    if (!siret.trim() || occupe) return
    setOccupe(true)
    setMessage(null)
    try {
      const res = await authService.sync({ siret: siret.trim() })
      setOrganization(res.organization)
      const avertissement = (res as { siret_warning?: string }).siret_warning
      if (avertissement) setMessage(avertissement)
      client.invalidateQueries({ queryKey: ['memoire-config'] })
    } catch {
      setMessage('La vérification n’a pas abouti. Réessayez dans un instant, ou renseignez votre entreprise à la main.')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Carte aria-labelledby="commencer-siret" className="max-w-xl">
      <h2 id="commencer-siret" className="text-lg font-semibold text-fg">Commencer par votre SIRET</h2>
      <p className="mt-1.5 text-sm text-fg-2">
        Le répertoire Sirene remplit pour vous la raison sociale, la forme juridique, l’adresse et l’activité. Le reste se complète au fil de vos réponses.
      </p>
      <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void valider() }}>
        <Champ
          value={siret}
          onChange={(e) => setSiret(e.target.value)}
          placeholder="14 chiffres"
          aria-label="Numéro SIRET"
          inputMode="numeric"
          autoComplete="off"
          className="chiffres flex-1"
        />
        <Bouton type="submit" variante="principal" disabled={!siret.trim()} enCours={occupe} libelleEnCours="Vérification…">Valider</Bouton>
      </form>
      <p role="status" className="mt-3 text-sm text-ambre-ink empty:hidden">{message}</p>
      {onPasser && <Bouton variante="lien" className="mt-4 text-sm" onClick={onPasser}>Renseigner mon entreprise à la main</Bouton>}
    </Carte>
  )
}
