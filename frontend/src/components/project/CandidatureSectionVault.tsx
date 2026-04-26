import { useMemo } from 'react'
import {
  CheckCircle2, AlertCircle, Clock, FolderOpen, FileText, Lock,
} from 'lucide-react'
import type { ChecklistItem } from '@/types'

const F = "'DM Sans', sans-serif"

type VaultCategory = 'administratif' | 'assurances' | 'financier' | 'technique'

const CATEGORY_ORDER: VaultCategory[] = ['administratif', 'assurances', 'financier', 'technique']

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  administratif: 'Pièces administratives',
  assurances:    'Assurances',
  financier:     'Capacités financières',
  technique:     'Capacités techniques',
}

function categorize(item: ChecklistItem): VaultCategory {
  const text = `${item.document_type_required} ${item.details || ''}`.toLowerCase()
  if (/assurance|décennale|decennale|rc[_ ]?(civile|professionnelle)|trc|dommages/.test(text))
    return 'assurances'
  if (/chiffre|ca\b|bilan|financ|effectif/.test(text))
    return 'financier'
  if (/qualibat|certificat|référence|reference|qualification|caces|amiante|chantier/.test(text))
    return 'technique'
  return 'administratif'
}

interface Props {
  items: ChecklistItem[]
  onPickFromVault: (item: ChecklistItem) => void
  onOpenVault: () => void
}

export default function CandidatureSectionVault({ items, onPickFromVault, onOpenVault }: Props) {
  const grouped = useMemo(() => {
    const map: Record<VaultCategory, ChecklistItem[]> = {
      administratif: [], assurances: [], financier: [], technique: [],
    }
    for (const item of items) map[categorize(item)].push(item)
    return map
  }, [items])

  if (items.length === 0) return null

  const present = items.filter((i) => i.status === 'present').length

  return (
    <section
      className="bg-white rounded-lg overflow-hidden"
      style={{ border: '1px solid #F1F5F9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', fontFamily: F }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#F0F9FF' }}
          >
            <FolderOpen size={18} style={{ color: '#0EA5E9' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: '#0F172A' }}>
              Pièces du coffre-fort
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {present}/{items.length} fournies — sélectionnez une pièce existante de votre coffre-fort
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenVault}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-sky-50 shrink-0"
          style={{ border: '1px solid #0EA5E9', color: '#0EA5E9' }}
        >
          <Lock size={13} />
          Ouvrir le coffre-fort
        </button>
      </header>

      {/* Categories */}
      <div className="px-6 py-2">
        {CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => (
          <div key={cat} className="py-3" style={{ borderBottom: '1px solid #F8FAFC' }}>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: '#94A3B8' }}
            >
              {CATEGORY_LABELS[cat]}
            </div>
            <ul className="space-y-1.5">
              {grouped[cat].map((item) => (
                <VaultRow key={item.id} item={item} onPick={() => onPickFromVault(item)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function VaultRow({ item, onPick }: { item: ChecklistItem; onPick: () => void }) {
  const { icon, label, color } = statusFor(item.status)
  const isLinked = !!item.linked_document_id
  const isMissing = item.status === 'manquant' || item.status === 'expire'

  return (
    <li
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-slate-50"
      style={{ background: '#FAFBFC' }}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: '#1E293B' }}>
          {item.details || item.document_type_required}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px]" style={{ color }}>{label}</span>
          {isLinked && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: '#64748B' }}>
              <FileText size={11} />
              Lié au coffre-fort
            </span>
          )}
        </div>
      </div>

      {isMissing ? (
        <button
          type="button"
          onClick={onPick}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90 shrink-0"
          style={{ background: '#0EA5E9' }}
        >
          Choisir
        </button>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100 shrink-0"
          style={{ border: '1px solid #E2E8F0', color: '#64748B' }}
        >
          Remplacer
        </button>
      )}
    </li>
  )
}

function statusFor(status: ChecklistItem['status']): { icon: JSX.Element; label: string; color: string } {
  switch (status) {
    case 'present':
      return {
        icon: <CheckCircle2 size={16} style={{ color: '#10B981' }} />,
        label: 'Conforme',
        color: '#10B981',
      }
    case 'expire':
      return {
        icon: <AlertCircle size={16} style={{ color: '#EF4444' }} />,
        label: 'Expiré — à mettre à jour',
        color: '#EF4444',
      }
    case 'expiration_proche':
      return {
        icon: <Clock size={16} style={{ color: '#F59E0B' }} />,
        label: 'Expire bientôt',
        color: '#F59E0B',
      }
    default:
      return {
        icon: <AlertCircle size={16} style={{ color: '#EF4444' }} />,
        label: 'Manquant',
        color: '#EF4444',
      }
  }
}
