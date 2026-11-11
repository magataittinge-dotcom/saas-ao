import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { useCreateProject } from '@/hooks/useProject'
import { setPendingUpload } from '@/lib/pendingUpload'
import { nomAODepuisFichier } from '@/lib/nomAO'
import { messageErreur } from '@/lib/erreurs'
import { Bouton } from '@/components/ui/bouton'
import { Message } from '@/components/ui/message'
import EntreeFichier from '@/components/depot/EntreeFichier'
import { ZoneDepot, SUITE_DEPOT } from '@/components/depot/ZoneDepot'

/** Les formats que l'étape de dépôt envoie au serveur (les mêmes ici : rien n'est refusé à la création pour être accepté ensuite). */
const ACCEPTES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
}
export const FORMATS_DEPOT = 'PDF, Word, Excel, OpenDocument ou ZIP, jusqu’à 2 Go par fichier'

interface Props {
  titre: ReactNode
  precision: ReactNode
  /** Le seul geste de l'écran : la zone porte alors le bouton principal « Choisir un fichier » (écran « Nouvel AO »). */
  geste?: boolean
  /** Dit, à côté du geste, ce que Synorix fera du dossier (écran « Nouvel appel d'offres »). */
  suite?: boolean
  className?: string
}

/**
 * Zone de dépôt qui crée l'AO : le nom est tiré du fichier (renommable ensuite), puis on passe à l'étape de
 * dépôt avec le fichier déjà prêt. Partagée par l'écran « Bienvenue », l'écran vide de « Mes AO » et /projects/new.
 * La création peut échouer : on le dit, et on garde le fichier pour réessayer (1.16).
 */
export default function ZoneDepotAO({ titre, precision, geste, suite, className }: Props) {
  const navigate = useNavigate()
  const { mutate: createProject, isPending: isCreating } = useCreateProject()
  const [echec, setEchec] = useState<{ message: string; fichiers: File[] } | null>(null)

  // Un ZIP, un PDF, ou plusieurs fichiers à la fois : l'AO prend le nom du premier (un ZIP s'il y en a un), tous partent à
  // l'étape de dépôt, qui les envoie l'un après l'autre (le serveur reçoit un fichier par envoi).
  const creerAvec = useCallback((fichiers: File[]) => {
    setEchec(null)
    const file = fichiers.find((f) => f.name.toLowerCase().endsWith('.zip')) ?? fichiers[0]
    const name = nomAODepuisFichier(file.name)
    createProject({ name }, {
      onSuccess: (project) => {
        setPendingUpload(fichiers)
        navigate(`/projects/${project.id}/upload`)
      },
      onError: async (err) => {
        setEchec({
          message: await messageErreur(err, "La création de l’AO n’a pas abouti. Vos fichiers sont conservés : réessayez."),
          fichiers,
        })
      },
    })
  }, [createProject, navigate])

  const onDrop = useCallback((files: File[]) => {
    if (files.length === 0 || isCreating) return
    creerAvec(files)
  }, [creerAvec, isCreating])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: () => setEchec(null),
    multiple: true,
    accept: ACCEPTES,
    maxSize: 2 * 1024 * 1024 * 1024,
  })

  return (
    <>
      {echec && (
        <Message ton="erreur" className="mb-4 w-full text-left"
          action={<Bouton variante="secondaire" onClick={() => creerAvec(echec.fichiers)}>Réessayer</Bouton>}>
          {echec.message}
        </Message>
      )}
      <ZoneDepot
        racine={{ ...getRootProps(), 'aria-busy': isCreating || undefined }}
        entree={<EntreeFichier {...getInputProps()} />}
        survol={isDragActive}
        titre={isDragActive ? 'Lâchez le dossier ici' : titre}
        phrase={precision}
        bouton={geste ? (
          <Bouton variante="principal" enCours={isCreating} libelleEnCours="Création de l’AO…">Choisir un fichier</Bouton>
        ) : isCreating ? <p role="status" className="text-sm font-medium text-fg">Création de l’AO…</p> : undefined}
        formats={FORMATS_DEPOT}
        suite={suite ? SUITE_DEPOT : undefined}
        centree={!suite}
        className={`cursor-pointer ${className ?? ''}`}
      />
    </>
  )
}
