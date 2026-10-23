import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '@/services/api'

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
 * C23 — cloche de notifications sobres (badge non-lus + liste déroulante).
 */
export default function NotificationBell() {
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
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const unread = data?.unread ?? 0

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative grid size-9 place-items-center rounded-md text-encre-3 transition-colors hover:bg-surface-2 hover:text-encre touch-target"
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} non lues` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={18} strokeWidth={1.6} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-encre px-1 text-xs font-semibold tabular-nums leading-none text-sur-encre">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="calque absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-[10px] border border-ligne bg-surface shadow-flottant">
          <div className="flex items-center justify-between border-b border-ligne px-4 py-2.5">
            <span className="text-sm font-semibold text-encre">Notifications</span>
            {unread > 0 && (
              <button onClick={() => markAllRead()} className="text-xs text-prusse-700 hover:underline underline-offset-2">
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-encre-3">
                Aucune notification
              </p>
            ) : (
              data!.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className="w-full border-b border-ligne px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2"
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-prusse-500" />
                    )}
                    <div className="min-w-0">
                      <p className={n.read ? 'text-sm leading-snug text-encre-2' : 'text-sm font-semibold leading-snug text-encre'}>
                        {n.titre}
                      </p>
                      {n.corps && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-encre-3">{n.corps}</p>
                      )}
                      <p className="mt-1 text-xs text-encre-3">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
