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
        className="relative p-2 rounded-full touch-target"
        style={{ color: '#94A3B8' }}
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: '#0EA5E9' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden z-50"
          style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <span className="text-sm font-bold" style={{ color: '#0F172A' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={() => markAllRead()} className="text-xs hover:underline" style={{ color: '#0EA5E9' }}>
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: '#94A3B8' }}>
                Aucune notification
              </p>
            ) : (
              data!.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className="w-full text-left px-4 py-3 transition-colors hover:bg-[#F8FAFC]"
                  style={{ borderBottom: '1px solid #F8FAFC' }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#0EA5E9' }} />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm leading-snug" style={{ color: n.read ? '#64748B' : '#0F172A', fontWeight: n.read ? 400 : 600 }}>
                        {n.titre}
                      </p>
                      {n.corps && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#94A3B8' }}>{n.corps}</p>
                      )}
                      <p className="text-[10px] mt-1" style={{ color: '#CBD5E1' }}>{timeAgo(n.created_at)}</p>
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
