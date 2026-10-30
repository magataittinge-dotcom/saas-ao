import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { useCreateProject } from '@/hooks/useProject'
import { setPendingUpload } from '@/lib/pendingUpload'
import { messageErreur } from '@/lib/erreurs'
import EchecAction from '@/components/common/EchecAction'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * C15 — onboarding wow : UN écran central après l'inscription.
 * SIRET (une seule saisie, Sirene pré-remplit le profil) puis dropzone
 * « Déposez votre premier DCE — il est offert ». Zéro formulaire
 * supplémentaire : le profil se complète au fil de l'eau.
 * Il s'affiche sur le tableau de bord, en clair comme en nuit (jetons du système). Le visage est celui de
 * public/visage (poster), jamais un autre.
 */
export default function FirstAOWelcome() {
  const navigate = useNavigate()
  const { organization, setOrganization, user } = useAuthStore()
  const { mutate: createProject, isPending: isCreating } = useCreateProject()

  const [siret, setSiret] = useState('')
  const [siretBusy, setSiretBusy] = useState(false)
  const [siretMsg, setSiretMsg] = useState<string | null>(null)
  const [siretDone, setSiretDone] = useState(!!organization?.siret)
  // 1.16 — la création de l'AO peut échouer : on le dit, et on garde le fichier pour réessayer
  const [echec, setEchec] = useState<{ message: string; fichier: File } | null>(null)

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

  const creerAvec = useCallback((file: File) => {
    setEchec(null)
    // Nom de l'AO dérivé du fichier — zéro formulaire, renommable ensuite.
    const name = file.name.replace(/\.(zip|pdf|docx|xlsx|xls)$/i, '').replace(/[_-]+/g, ' ').trim()
      || 'Mon premier AO'
    createProject({ name }, {
      onSuccess: (project) => {
        setPendingUpload(file)
        navigate(`/projects/${project.id}/upload`)
      },
      onError: async (err) => {
        setEchec({
          message: await messageErreur(err, "La création de l'AO n'a pas abouti. Votre fichier est conservé : réessayez."),
          fichier: file,
        })
      },
    })
  }, [createProject, navigate])

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (!file || isCreating) return
    creerAvec(file)
  }, [creerAvec, isCreating])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      'application/zip': ['.zip'],
      'application/pdf': ['.pdf'],
    },
  })

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
          {echec && (
            <div className="mb-4 w-full text-left">
              <EchecAction calque message={echec.message} onReessayer={() => creerAvec(echec.fichier)} />
            </div>
          )}
          <div
            {...getRootProps()}
            className={cn(
              'w-full cursor-pointer rounded-xl border-2 border-dashed px-8 py-14 transition-colors duration-base ease-lien',
              isDragActive ? 'border-accent-ring bg-accent-tint' : 'border-input bg-surface-1 hover:border-fg-3',
            )}
          >
            <input {...getInputProps()} />
            {isCreating ? (
              <Loader2 size={28} className="mx-auto animate-spin text-fg-3" aria-hidden />
            ) : (
              <CloudUpload size={28} strokeWidth={1.6} className="mx-auto text-fg-3" aria-hidden />
            )}
            <p className="mt-4 text-base font-semibold text-fg">
              Déposez votre premier DCE — il est offert
            </p>
            <p className="mt-1.5 text-[13px] text-fg-3">
              ZIP complet ou PDF · analyse, vérification et mémoire compris
            </p>
          </div>
        </>
      )}
    </div>
  )
}
