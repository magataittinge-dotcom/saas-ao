import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import ZoneDepotAO from './ZoneDepotAO'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * C15 — onboarding wow : UN écran central après l'inscription.
 * SIRET (une seule saisie, Sirene pré-remplit le profil) puis dropzone
 * « Déposez votre premier DCE — il est offert ». Zéro formulaire
 * supplémentaire : le profil se complète au fil de l'eau.
 * Il s'affiche sur le tableau de bord, en clair comme en nuit (jetons du système). Le visage est celui de
 * public/visage (poster), jamais un autre.
 */
export default function FirstAOWelcome() {
  const { organization, setOrganization, user } = useAuthStore()

  const [siret, setSiret] = useState('')
  const [siretBusy, setSiretBusy] = useState(false)
  const [siretMsg, setSiretMsg] = useState<string | null>(null)
  const [siretDone, setSiretDone] = useState(!!organization?.siret)

  const submitSiret = async () => {
    if (!siret.trim()) return
    setSiretBusy(true)
    setSiretMsg(null)
    try {
      const res = await authService.sync({ siret: siret.trim() })
      setOrganization(res.organization)
      const warning = (res as { siret_warning?: string }).siret_warning
      if (warning) setSiretMsg(warning)
      setSiretDone(true)
    } catch {
      setSiretMsg('Vérification impossible pour le moment — vous pourrez compléter plus tard.')
      setSiretDone(true)
    } finally {
      setSiretBusy(false)
    }
  }

  const firstName = user?.name?.split(' ')[0]

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-12 text-center">
      <img
        src="/visage/tete-ouverte-poster.webp"
        alt=""
        width={56}
        height={56}
        className="mb-5 size-14 rounded-full bg-surface-1 object-cover"
      />
      <h1 className="mb-1.5 font-display text-h5 text-fg">
        Bienvenue{firstName ? `, ${firstName}` : ''}
      </h1>

      {!siretDone ? (
        <>
          <p className="mb-7 text-[15px] text-fg-2">
            Votre SIRET — et c'est tout : le répertoire Sirene remplit le reste de votre profil.
          </p>
          <div className="flex w-full gap-2">
            <Input
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
              placeholder="N° SIRET (14 chiffres)"
              aria-label="Numéro SIRET"
              inputMode="numeric"
              className="flex-1 text-[15px]"
              onKeyDown={(e) => e.key === 'Enter' && submitSiret()}
            />
            <Button onClick={submitSiret} disabled={siretBusy || !siret.trim()}>
              {siretBusy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : 'Valider'}
            </Button>
          </div>
          <button onClick={() => setSiretDone(true)}
            className="mt-3 inline-flex items-center rounded-xs text-[13px] text-fg-3 underline-offset-[3px] transition-colors duration-base ease-lien hover:text-fg hover:underline [@media(pointer:coarse)]:min-h-11">
            Passer cette étape
          </button>
        </>
      ) : (
        <>
          {siretMsg && (
            <p className="mb-3 max-w-md text-[13px] text-warning">{siretMsg}</p>
          )}
          <p className="mb-7 text-[15px] text-fg-2">
            Votre profil se complétera au fil de vos réponses — commencez directement.
          </p>
          <ZoneDepotAO
            titre="Déposez votre premier DCE — il est offert"
            precision="ZIP complet ou PDF · analyse, vérification et mémoire compris"
          />
        </>
      )}
    </div>
  )
}
