import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, Loader2 } from 'lucide-react'
import { useCreateProject } from '@/hooks/useProject'
import { setPendingUpload } from '@/lib/pendingUpload'
import { nomAODepuisFichier } from '@/lib/nomAO'
import { messageErreur } from '@/lib/erreurs'
import EchecAction from '@/components/common/EchecAction'
import { cn } from '@/lib/utils'

interface Props {
  titre: ReactNode
  precision: string
  className?: string
}

/**
 * Zone de dépôt qui crée l'AO : le nom est tiré du fichier (renommable ensuite), puis on passe à l'étape de
 * dépôt avec le fichier déjà prêt. Partagée par l'écran « Bienvenue » et par /projects/new.
 * La création peut échouer : on le dit, et on garde le fichier pour réessayer (1.16).
 */
export default function ZoneDepotAO({ titre, precision, className }: Props) {
  const navigate = useNavigate()
  const { mutate: createProject, isPending: isCreating } = useCreateProject()
  const [echec, setEchec] = useState<{ message: string; fichier: File } | null>(null)

  const creerAvec = useCallback((file: File) => {
    setEchec(null)
    const name = nomAODepuisFichier(file.name)
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

  return (
    <>
      {echec && (
        <div className="mb-4 w-full text-left">
          <EchecAction calque message={echec.message} onReessayer={() => creerAvec(echec.fichier)} />
        </div>
      )}
      <div
        {...getRootProps()}
        className={cn(
          'w-full cursor-pointer rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors duration-base ease-lien',
          isDragActive ? 'border-accent-ring bg-accent-tint' : 'border-input bg-surface-1 hover:border-fg-3',
          className,
        )}
      >
        <input {...getInputProps()} />
        {isCreating ? (
          <Loader2 size={28} className="mx-auto animate-spin text-fg-3" aria-hidden />
        ) : (
          <CloudUpload size={28} strokeWidth={1.6} className="mx-auto text-fg-3" aria-hidden />
        )}
        <p className="mt-4 text-base font-semibold text-fg">{titre}</p>
        <p className="mt-1.5 text-[13px] text-fg-3">{precision}</p>
      </div>
    </>
  )
}
