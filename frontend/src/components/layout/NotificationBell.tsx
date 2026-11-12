import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '@/services/api'
import { cn } from '@/lib/utils'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'

interface NotificationItem {
  id: string
  type: string
  titre: string
  corps: string | null
  read: boolean
  created_at: string
}

const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

/**
 * Quand la notification est arrivée, en mots entiers (jury, tour 1 : « il y a 8 j », « il y a 15 j ») : à l'instant, il y a
 * 12 min, il y a 3 h, hier, il y a 4 jours ; au-delà d'une semaine, la date (« 3 nov. », heure de Paris).
 */
export function quandNotification(iso: string, maintenant: number = Date.now()): string {
  const date = new Date(iso)
  const mins = Math.floor((maintenant - date.getTime()) / 60000)
  if (mins < 1) return 'à l’instant'
  if (mins < 60) return `il y a ${mins} min`
  const heures = Math.floor(mins / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.floor(heures / 24)
  if (jours === 1) return 'hier'
  if (jours < 7) return `il y a ${jours} jours`
  return JOUR_COURT.format(date)
}

/**
 * Le texte d'une notification vient du serveur, parfois avec des pluriels entre parenthèses ou un accord faux (« 605
 * exigence(s) extraite(s) », « Remise dans 1 jours » : jury, tour 1, bloquants). En attendant que le serveur les écrive
 * justes, l'affichage les accorde : le nombre qui précède décide du singulier ou du pluriel.
 */
export function accorder(texte: string): string {
  return texte
    .replace(/(\d[\d\u00a0\u202f ]*)(\s+)((?:[^\s()]+\(s\)(?:\s+(?=[^\s()]+\(s\)))?)+)/g, (_tout, nombre: string, espace: string, mots: string) => {
      const pluriel = Number(nombre.replace(/\D/g, '')) > 1
      return `${nombre}${espace}${mots.replace(/\(s\)/g, pluriel ? 's' : '')}`
    })
    .replace(/\b([01])(\s+)jours\b/g, '$1$2jour')
    .replace(/\bRemise dans 1 jour\b/g, 'Remise demain')
    .replace(/\bRemise dans 0 jour\b/g, 'Remise aujourd’hui')
    // les mots du produit, pas ceux du code (jury, tour 1 : « projet », « généré », « extraites », « avant export »)
    .replace(/\b([Ll])e mémoire du projet\b/g, '$1e mémoire de l’appel d’offres')
    .replace(/\bdu projet\b/g, 'de l’appel d’offres')
    .replace(/\best généré(?!\p{L})/gu, 'est rédigé')
    .replace(/\bexigence(s?) extraite(s?)\b/g, 'exigence$1 relevée$2')
    .replace(/\bavant export\b/g, 'avant l’export')
}

/**
 * La cloche des notifications : un bouton de 44 px, un compteur neutre (les non lues), un panneau flottant aux jetons du
 * système (Échap et un clic ailleurs le ferment). `versLeHaut` : dans le tiroir « Compte » du téléphone, il s'ouvre au-dessus,
 * calé sur le bord droit du tiroir (la cloche a la déconnexion à sa droite : calé sur elle, il sortait par la gauche à 360 px).
 */
export default function NotificationBell({ versLeHaut = false }: { versLeHaut?: boolean }) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data } = useQuery<{ unread: number; items: NotificationItem[] }>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications')
      return data
    },
    refetchInterval: 60_000,
  })

  const { mutate: markAllRead } = useMutation({
    mutationFn: async () => { await api.post('/notifications/read-all') },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const { mutate: markRead } = useMutation({
    mutationFn: async (id: string) => { await api.post(`/notifications/${id}/read`) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', echap) }
  }, [open])

  const unread = data?.unread ?? 0
  const items = data?.items ?? []

  return (
    <div className="relative" ref={panelRef}>
      <BoutonIcone libelle={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="relative">
        <Bell aria-hidden strokeWidth={1.5} />
        {unread > 0 && (
          <span className="chiffres absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pilule bg-fg px-1 text-micro font-semibold leading-none text-fg-inverse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </BoutonIcone>

      {open && (
        <div data-panneau-notifications="" className={cn('absolute right-0 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-bord bg-surface-pop text-fg shadow-flottant', versLeHaut ? 'bottom-full -right-12 mb-2' : 'top-full mt-2 max-[768px]:fixed max-[768px]:inset-x-4 max-[768px]:top-14 max-[768px]:mt-1 max-[768px]:w-auto max-[768px]:max-w-none')}>
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-bord px-4">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <Bouton variante="lien" onClick={() => markAllRead()}>Tout marquer comme lu</Bouton>}
          </div>
          {/* le panneau prend la hauteur que l'écran offre (il n'en montrait que trois lignes et demie sur 425 px) */}
          <div className="max-h-[min(34rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-2">Les notifications arriveront ici : une analyse terminée, un mémoire prêt, une remise qui approche.</p>
            ) : (
              items.map((n) => (
                <button key={n.id} type="button" onClick={() => !n.read && markRead(n.id)}
                  className="flex min-h-[52px] w-full items-start gap-2 border-b border-bord px-4 py-3 text-left transition-colors duration-fast ease-survol last:border-b-0 hover:bg-surface-1">
                  <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-pilule', n.read ? 'bg-transparent' : 'bg-accent-ui')} />
                  <span className="min-w-0">
                    {/* deux lignes au plus : `line-clamp` pose son propre affichage, `block` l'annulait (les titres tenaient sur trois lignes) */}
                    <span className={cn('line-clamp-2 text-sm', n.read ? 'text-fg-2' : 'font-semibold text-fg')}>{accorder(n.titre)}</span>
                    {n.corps && <span className="mt-0.5 line-clamp-2 text-xs text-fg-2">{accorder(n.corps)}</span>}
                    <span className="mt-1 block text-xs text-fg-3">{quandNotification(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
