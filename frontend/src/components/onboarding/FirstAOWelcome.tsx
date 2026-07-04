import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, Loader2, Sparkles } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services/auth'
import { useCreateProject } from '@/hooks/useProject'
import { setPendingUpload } from '@/lib/pendingUpload'

/**
 * C15 — onboarding wow : UN écran central après l'inscription.
 * SIRET (une seule saisie, Sirene pré-remplit le profil) puis dropzone
 * « Déposez votre premier DCE — il est offert ». Zéro formulaire
 * supplémentaire : le profil se complète au fil de l'eau.
 */
export default function FirstAOWelcome() {
  const navigate = useNavigate()
  const { organization, setOrganization, user } = useAuthStore()
  const { mutate: createProject, isPending: isCreating } = useCreateProject()

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

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (!file || isCreating) return
    // Nom de l'AO dérivé du fichier — zéro formulaire, renommable ensuite.
    const name = file.name.replace(/\.(zip|pdf|docx|xlsx|xls)$/i, '').replace(/[_-]+/g, ' ').trim()
      || 'Mon premier AO'
    createProject({ name }, {
      onSuccess: (project) => {
        setPendingUpload(file)
        navigate(`/projects/${project.id}/upload`)
      },
    })
  }, [createProject, isCreating, navigate])

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
    <div className="max-w-xl mx-auto flex flex-col items-center text-center pt-10 animate-fade-in">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(14,165,233,0.10)' }}>
        <Sparkles size={22} className="text-ds-cyan" />
      </div>
      <h1 className="text-2xl font-bold text-ds-text mb-1">
        Bienvenue{firstName ? `, ${firstName}` : ''}
      </h1>

      {!siretDone ? (
        <>
          <p className="text-sm text-ds-text-2 mb-6">
            Votre SIRET — et c'est tout : le répertoire Sirene remplit le reste de votre profil.
          </p>
          <div className="w-full flex gap-2">
            <input
              value={siret}
              onChange={(e) => setSiret(e.target.value)}
              placeholder="N° SIRET (14 chiffres)"
              className="glass-input flex-1 py-2.5 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && submitSiret()}
            />
            <button
              onClick={submitSiret}
              disabled={siretBusy || !siret.trim()}
              className="btn-primary px-4 disabled:opacity-50"
            >
              {siretBusy ? <Loader2 size={16} className="animate-spin" /> : 'Valider'}
            </button>
          </div>
          <button onClick={() => setSiretDone(true)}
            className="text-xs mt-3 hover:underline" style={{ color: '#94A3B8' }}>
            Passer cette étape
          </button>
        </>
      ) : (
        <>
          {siretMsg && (
            <p className="text-xs mb-3 max-w-md" style={{ color: '#B45309' }}>{siretMsg}</p>
          )}
          <p className="text-sm text-ds-text-2 mb-6">
            Votre profil se complétera au fil de vos réponses — commencez directement.
          </p>
          <div
            {...getRootProps()}
            className="w-full border-2 border-dashed rounded-2xl px-8 py-14 cursor-pointer transition-colors"
            style={isDragActive
              ? { borderColor: '#0EA5E9', background: 'rgba(14,165,233,0.05)' }
              : { borderColor: '#CBD5E1', background: '#FFFFFF' }}
          >
            <input {...getInputProps()} />
            {isCreating ? (
              <Loader2 size={30} className="mx-auto animate-spin text-ds-cyan" />
            ) : (
              <CloudUpload size={30} className="mx-auto text-ds-cyan" />
            )}
            <p className="text-base font-semibold text-ds-text mt-4">
              Déposez votre premier DCE — il est offert
            </p>
            <p className="text-xs text-ds-text-3 mt-1.5">
              ZIP complet ou PDF · analyse, vérification et mémoire compris
            </p>
          </div>
        </>
      )}
    </div>
  )
}
