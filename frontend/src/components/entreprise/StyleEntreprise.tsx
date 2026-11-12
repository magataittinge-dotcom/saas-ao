import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { detailErreur } from '@/lib/fonctionsIA'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'
import { SqueletteLignes } from '@/components/ui/squelette'

/** Le style lu dans un ancien mémoire (backend/services/ai/fonctions_c.valider_style). */
export interface StyleLu {
  ton: string
  personne: string
  longueur_phrases: string
  structure: string
  vocabulaire: string[]
  exemples: string[]
}

export interface ReponseStyle {
  style: StyleLu | null
  source_fichier: string | null
  lu_le: string | null
}

const FORMATS = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
} as const

const LIGNES: { cle: keyof Pick<StyleLu, 'ton' | 'personne' | 'longueur_phrases' | 'structure'>; libelle: string }[] = [
  { cle: 'ton', libelle: 'Ton' },
  { cle: 'personne', libelle: 'Votre entreprise se nomme' },
  { cle: 'longueur_phrases', libelle: 'Phrases' },
  { cle: 'structure', libelle: 'Organisation' },
]

function dateFr(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
}

/** Ce que la carte montre (rendu seul dans les tests) : le style lu, ou la phrase qui dit ce que la lecture fera. */
export function ApercuStyle({ donnees }: { donnees: ReponseStyle }) {
  const { style } = donnees
  if (!style) {
    return (
      <p className="text-sm text-fg-2">
        Synorix peut parcourir un de vos anciens mémoires et décrire votre façon d’écrire : le ton, la longueur des phrases,
        les tournures qui reviennent. Ce style est montré ici seulement : la rédaction de vos mémoires n’en tient pas compte.
      </p>
    )
  }
  const le = dateFr(donnees.lu_le)
  return (
    <div className="space-y-4" data-style-entreprise="">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        {LIGNES.map((l) => (
          <div key={l.cle} className="contents">
            <dt className="text-xs font-medium text-fg-2 sm:pt-0.5">{l.libelle}</dt>
            <dd className="min-w-0 break-words text-sm text-fg">{style[l.cle]}</dd>
          </div>
        ))}
        <dt className="text-xs font-medium text-fg-2 sm:pt-0.5">Tournures</dt>
        <dd className="min-w-0">
          <ul className="flex flex-wrap gap-2" aria-label="Tournures qui reviennent">
            {style.vocabulaire.map((v) => (
              <li key={v} className="rounded-pilule border border-bord px-3 py-1 text-sm text-fg">{v}</li>
            ))}
          </ul>
        </dd>
      </dl>
      {style.exemples.length > 0 && (
        <figure className="space-y-2">
          <figcaption className="text-xs font-medium text-fg-2">Dans votre texte</figcaption>
          {style.exemples.map((e) => (
            <blockquote key={e} className="break-words border-l-2 border-bord pl-4 font-memoire text-base text-fg">« {e} »</blockquote>
          ))}
        </figure>
      )}
      <p className="text-xs text-fg-3">
        Tiré de {donnees.source_fichier}{le ? `, le ${le}` : ''}. Montré ici seulement : la rédaction de vos mémoires n’en tient pas compte.
      </p>
    </div>
  )
}

/**
 * C4 — « Le style de mon entreprise » (STYLE_ENTREPRISE, éteinte par défaut côté serveur) : le style lu dans un ancien
 * mémoire par Haiku 4.5, enregistré et montré ici. LECTURE SEULE (décision D5) : jamais envoyé au générateur.
 * Rendu par Mon entreprise seulement quand le serveur dit la fonction allumée.
 */
export default function StyleEntreprise() {
  const queryClient = useQueryClient()
  const [dialogue, setDialogue] = useState(false)
  const [fichier, setFichier] = useState<File | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => { if (dialogue) { setFichier(null); setErreur(null) } }, [dialogue])

  const lecture = useQuery({
    queryKey: ['style-entreprise'],
    queryFn: async () => (await api.get<ReponseStyle>('/entreprise/style')).data,
  })
  const lire = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      return (await api.post<ReponseStyle>('/entreprise/style', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 })).data
    },
    onSuccess: (r) => { queryClient.setQueryData(['style-entreprise'], r); setDialogue(false) },
    onError: (err) => setErreur(detailErreur(err, 'Le style n’a pas pu être relevé. Rien n’a été décompté ; réessayez dans un instant.')),
  })
  const effacer = useMutation({
    mutationFn: async () => (await api.delete<ReponseStyle>('/entreprise/style')).data,
    onSuccess: (r) => queryClient.setQueryData(['style-entreprise'], r),
  })
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: FORMATS, multiple: false, noClick: true, noKeyboard: true, disabled: lire.isPending,
    onDrop: (acceptes) => { if (acceptes[0]) { setFichier(acceptes[0]); setErreur(null) } },
    onDropRejected: () => setErreur('Ce format n’est pas lu : déposez un fichier Word (.docx) ou PDF.'),
  })

  const donnees = lecture.data
  return (
    <div className="space-y-4">
      {lecture.isLoading ? (
        <div role="status" aria-busy="true"><span className="sr-only">Chargement du style…</span><SqueletteLignes lignes={3} /></div>
      ) : lecture.isError || !donnees ? (
        <Message ton="erreur" action={<Bouton variante="secondaire" onClick={() => { void lecture.refetch() }}>Réessayer</Bouton>}>
          Le style n’a pas pu s’afficher. La connexion au serveur a échoué.
        </Message>
      ) : (
        <ApercuStyle donnees={donnees} />
      )}
      <div className="flex flex-wrap gap-2">
        <Bouton variante="secondaire" onClick={() => setDialogue(true)}>
          {donnees?.style ? 'Lire un autre mémoire' : 'Lire un ancien mémoire'}
        </Bouton>
        {donnees?.style && (
          <Bouton variante="discret" onClick={() => effacer.mutate()} enCours={effacer.isPending} libelleEnCours="Effacement…">Effacer ce style</Bouton>
        )}
      </div>
      <Dialogue
        ouvert={dialogue}
        onOuvert={(o) => { if (!o && !lire.isPending) setDialogue(false) }}
        taille="petit"
        titre="Lire le style d’un ancien mémoire"
        description="Déposez un mémoire technique que vous avez rédigé. Synorix décrit votre façon d’écrire ; le fichier n’est pas gardé."
        actions={<>
          <Bouton variante="secondaire" onClick={() => setDialogue(false)} disabled={lire.isPending}>Annuler</Bouton>
          <Bouton variante="principal" onClick={() => { if (fichier) lire.mutate(fichier) }} disabled={!fichier} enCours={lire.isPending} libelleEnCours="Relevé du style…">
            Lire le style
          </Bouton>
        </>}
      >
        <div {...getRootProps({ className: cn('grid justify-items-start gap-3 rounded-lg transition-colors duration-fast ease-survol', isDragActive && 'bg-accent-tint outline-dashed outline-2 outline-offset-4 outline-accent-ring') })}>
          <Champ {...getInputProps()} aria-label="Ancien mémoire à lire" />
          {fichier ? (
            <p className="flex min-w-0 max-w-full items-center gap-2 text-sm font-medium text-fg">
              <FileText aria-hidden size={18} strokeWidth={1.5} className="shrink-0 text-fg-2" />
              <span className="truncate">{fichier.name}</span>
            </p>
          ) : (
            <p className="text-sm text-fg-2">Glissez le fichier dans cette fenêtre, ou choisissez-le. Word (.docx) ou PDF.</p>
          )}
          <Bouton variante="secondaire" onClick={open} disabled={lire.isPending}>{fichier ? 'Choisir un autre fichier' : 'Choisir un fichier'}</Bouton>
        </div>
        {lire.isPending && <p role="status" className="text-sm text-fg-2">Cela prend une dizaine de secondes. Vous pouvez laisser cette fenêtre ouverte.</p>}
        {erreur && <Message ton="erreur">{erreur}</Message>}
      </Dialogue>
    </div>
  )
}
