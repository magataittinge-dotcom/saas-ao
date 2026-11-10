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

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `il y a ${Math.max(mins, 1)} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  return `il y a ${Math.floor(hours / 24)} j`
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
        <div data-panneau-notifications="" className={cn('absolute right-0 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-bord bg-surface-pop text-fg shadow-flottant', versLeHaut ? 'bottom-full -right-12 mb-2' : 'top-full mt-2')}>
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-bord px-4">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <Bouton variante="lien" onClick={() => markAllRead()}>Tout marquer lu</Bouton>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-fg-2">Les notifications arriveront ici : une lecture terminée, un mémoire prêt, une remise qui approche.</p>
            ) : (
              items.map((n) => (
                <button key={n.id} type="button" onClick={() => !n.read && markRead(n.id)}
                  className="flex min-h-[52px] w-full items-start gap-2 border-b border-bord px-4 py-3 text-left transition-colors duration-fast ease-survol last:border-b-0 hover:bg-surface-1">
                  <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-pilule', n.read ? 'bg-transparent' : 'bg-accent-ui')} />
                  <span className="min-w-0">
                    <span className={cn('block text-sm', n.read ? 'text-fg-2' : 'font-semibold text-fg')}>{n.titre}</span>
                    {n.corps && <span className="mt-0.5 line-clamp-2 block text-xs text-fg-2">{n.corps}</span>}
                    <span className="mt-1 block text-xs text-fg-3">{timeAgo(n.created_at)}</span>
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
