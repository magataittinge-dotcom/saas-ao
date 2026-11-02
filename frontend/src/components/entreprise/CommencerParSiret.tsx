import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
      setMessage('Vérification impossible pour le moment. Réessayez dans un instant, ou renseignez votre entreprise à la main.')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <section aria-labelledby="commencer-siret" className="mx-auto w-full max-w-xl rounded-xl border border-bord-2 bg-surface-1 p-6 shadow-card sm:p-8">
      <h2 id="commencer-siret" className="font-display text-h5 text-fg">Commencer par votre SIRET</h2>
      <p className="mt-2 text-[15px] text-fg-2">
        Le répertoire Sirene remplit pour vous la raison sociale, la forme juridique, l'adresse et l'activité. Le reste se complète au fil de vos réponses.
      </p>
      <form className="mt-6 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); valider() }}>
        <Input
          value={siret}
          onChange={(e) => setSiret(e.target.value)}
          placeholder="N° SIRET (14 chiffres)"
          aria-label="Numéro SIRET"
          inputMode="numeric"
          autoComplete="off"
          className="flex-1 text-[15px]"
        />
        <Button type="submit" disabled={occupe || !siret.trim()}>
          {occupe ? <Loader2 size={16} className="animate-spin" aria-hidden /> : 'Valider'}
        </Button>
      </form>
      <p role="status" className="mt-3 text-[13px] text-warning empty:hidden">{message}</p>
      {onPasser && (
        <button
          type="button"
          onClick={onPasser}
          className="mt-4 inline-flex items-center rounded-xs text-[13px] text-fg-3 underline-offset-[3px] transition-colors duration-base ease-lien hover:text-fg hover:underline [@media(pointer:coarse)]:min-h-11"
        >
          Renseigner mon entreprise à la main
        </button>
      )}
    </section>
  )
}
