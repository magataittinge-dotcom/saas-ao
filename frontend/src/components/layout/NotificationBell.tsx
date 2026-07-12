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
        style={{ color: '#6B7280' }}
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center edge-data"
            style={{ background: '#22D3EE', color: '#0A0B0D' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden z-50"
          style={{ background: '#1A1D21', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-sm font-bold" style={{ color: '#E7EAEE' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={() => markAllRead()} className="text-xs hover:underline" style={{ color: '#22D3EE' }}>
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.items ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm" style={{ color: '#6B7280' }}>
                Aucune notification
              </p>
            ) : (
              data!.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className="w-full text-left px-4 py-3 transition-colors hover:bg-[#232730]"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: '#22D3EE' }} />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm leading-snug" style={{ color: n.read ? '#9AA3AE' : '#E7EAEE', fontWeight: n.read ? 400 : 600 }}>
                        {n.titre}
                      </p>
                      {n.corps && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#6B7280' }}>{n.corps}</p>
                      )}
                      <p className="text-[10px] mt-1" style={{ color: '#4B5563' }}>{timeAgo(n.created_at)}</p>
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
