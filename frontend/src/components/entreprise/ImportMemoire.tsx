import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { messageErreur } from '@/lib/erreurs'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'
import type { MemoireConfig } from '@/types'

// Import d'un mémoire déjà rédigé (.docx ou .pdf) : Synorix pré-remplit le profil, l'utilisateur vérifie avant d'enregistrer.
// Le Dialogue du système porte le portail, le voile, Échap et le piège de focus (l'ancienne fenêtre `fixed`, posée dans
// une section animée, se plaçait dans la section et non sur l'écran).

export interface ImportDialogProps {
  ouvert: boolean
  onClose: () => void
  onImported: (extracted: Partial<MemoireConfig>, count: number) => void
}

const FORMATS = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const

export function ImportDialog({ ouvert, onClose, onImported }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  // chaque ouverture repart d'un dialogue vide
  useEffect(() => { if (ouvert) { setFile(null); setError(null) } }, [ouvert])

  const { mutate: doImport, isPending } = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      const { data } = await api.post<{ extracted: Record<string, unknown>; fields_count: number }>(
        '/memoire-config/import',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data
    },
    onSuccess: ({ extracted, fields_count }) => {
      onImported(extracted as Partial<MemoireConfig>, fields_count)
    },
    onError: async (err) => {
      setError(await messageErreur(err, 'La lecture du mémoire n’a pas abouti. Votre profil n’est pas modifié : réessayez dans un instant.'))
    },
  })

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: FORMATS,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: isPending,
    onDrop: (acceptes) => { if (acceptes[0]) { setFile(acceptes[0]); setError(null) } },
    onDropRejected: () => setError('Ce format n’est pas lu : déposez un fichier Word (.docx) ou PDF.'),
  })

  return (
    <Dialogue
      ouvert={ouvert}
      onOuvert={(o) => { if (!o && !isPending) onClose() }}
      taille="petit"
      titre="Importer un mémoire"
      description="Déposez un mémoire technique déjà rédigé (Word ou PDF). Synorix y lit vos informations et pré-remplit vos rubriques ; rien n’est enregistré avant votre vérification."
      actions={<>
        <Bouton variante="secondaire" onClick={onClose} disabled={isPending}>Annuler</Bouton>
        <Bouton variante="principal" onClick={() => { if (file) doImport(file) }} disabled={!file} enCours={isPending} libelleEnCours="Lecture du mémoire…">
          Importer et pré-remplir
        </Bouton>
      </>}
    >
      <div {...getRootProps({ className: cn('grid justify-items-start gap-3 rounded-lg border border-bord p-4 transition-colors duration-fast ease-survol', isDragActive && 'border-accent-ring bg-accent-tint') })}>
        <Champ {...getInputProps()} aria-label="Mémoire technique à importer" />
        {file ? (
          <p className="flex min-w-0 max-w-full items-center gap-2 text-sm font-medium text-fg">
            <FileText aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-2" />
            <span className="truncate">{file.name}</span>
            <span className="chiffres shrink-0 font-normal text-fg-3">{Math.max(1, Math.round(file.size / 1024))} Ko</span>
          </p>
        ) : (
          <p className="text-sm text-fg-2">Glissez le fichier ici, ou choisissez-le. Formats lus : Word (.docx) et PDF.</p>
        )}
        <Bouton variante="secondaire" onClick={open} disabled={isPending}>{file ? 'Choisir un autre fichier' : 'Choisir un fichier'}</Bouton>
      </div>
      {isPending && <p role="status" className="text-sm text-fg-2">La lecture prend une quinzaine de secondes. Vous pouvez laisser cette fenêtre ouverte.</p>}
      {error && <Message ton="erreur">{error}</Message>}
    </Dialogue>
  )
}
