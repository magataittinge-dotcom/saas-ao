import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { CloudUpload } from 'lucide-react'
import { useCreateProject } from '@/hooks/useProject'
import { setPendingUpload } from '@/lib/pendingUpload'
import { nomAODepuisFichier } from '@/lib/nomAO'
import { messageErreur } from '@/lib/erreurs'
import { Bouton } from '@/components/ui/bouton'
import { Message } from '@/components/ui/message'
import EntreeFichier from '@/components/depot/EntreeFichier'
import { cn } from '@/lib/utils'

interface Props {
  titre: ReactNode
  precision: string
  /** Le seul geste de l'écran : la zone porte alors le bouton principal « Choisir un fichier » (écran « Nouvel AO »). */
  geste?: boolean
  className?: string
}

/**
 * Zone de dépôt qui crée l'AO : le nom est tiré du fichier (renommable ensuite), puis on passe à l'étape de
 * dépôt avec le fichier déjà prêt. Partagée par l'écran « Bienvenue », l'écran vide de « Mes AO » et /projects/new.
 * La création peut échouer : on le dit, et on garde le fichier pour réessayer (1.16).
 */
export default function ZoneDepotAO({ titre, precision, geste, className }: Props) {
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
          message: await messageErreur(err, "La création de l’AO n’a pas abouti. Votre fichier est conservé : réessayez."),
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
        <Message ton="erreur" className="mb-4 w-full text-left"
          action={<Bouton variante="secondaire" onClick={() => creerAvec(echec.fichier)}>Réessayer</Bouton>}>
          {echec.message}
        </Message>
      )}
      <div
        {...getRootProps()}
        aria-busy={isCreating || undefined}
        className={cn(
          'grid w-full cursor-pointer place-items-center rounded-carte border border-dashed px-6 py-14 text-center transition-colors duration-survol ease-survol',
          isDragActive ? 'border-accent-ring bg-accent-tint' : 'border-bord-champ bg-surface-1 hover:border-fg-3',
          className,
        )}
      >
        <EntreeFichier {...getInputProps()} />
        <div className="grid justify-items-center">
          <CloudUpload size={28} strokeWidth={1.5} className="text-fg-3" aria-hidden />
          <p className="mt-4 text-lg font-semibold text-fg">{isDragActive ? 'Lâchez le dossier ici' : titre}</p>
          <p className="mt-1.5 text-sm text-fg-2">{precision}</p>
          {geste && (
            <Bouton variante="principal" className="mt-6" enCours={isCreating} libelleEnCours="Création de l’AO…">
              Choisir un fichier
            </Bouton>
          )}
          {!geste && isCreating && <p role="status" className="mt-4 text-sm font-medium text-fg">Création de l’AO…</p>}
        </div>
      </div>
    </>
  )
}
