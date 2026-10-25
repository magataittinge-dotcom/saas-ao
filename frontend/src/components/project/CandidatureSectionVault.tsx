import { useMemo } from 'react'
import {
  CheckCircle2, AlertCircle, Circle, Clock, FolderOpen, FileText, Lock,
} from 'lucide-react'
import type { ChecklistItem } from '@/types'
import SignatureLigne from '@/components/project/SignatureLigne'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

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
  /** Confirmation de signature, quand le RC la demande (ex. DUME signé). */
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
}

export default function CandidatureSectionVault({ items, onPickFromVault, onOpenVault, onToggleSignature }: Props) {
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
      className="glass-card rounded-lg overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.4)', fontFamily: F }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <FolderOpen size={18} style={{ color: '#E8E9EB' }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: '#F7F8F8' }}>
              Pièces du coffre-fort
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#959597' }}>
              {present}/{items.length} fournies — sélectionnez une pièce existante de votre coffre-fort
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenVault}
          className="glass-btn flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
          style={{ color: '#C2C3C6' }}
        >
          <Lock size={13} />
          Ouvrir le coffre-fort
        </button>
      </header>

      {/* Categories */}
      <div className="px-5 py-1.5">
        {CATEGORY_ORDER.filter((cat) => grouped[cat].length > 0).map((cat) => (
          <div key={cat} className="py-3" style={{ borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: '#909195' }}
            >
              {CATEGORY_LABELS[cat]}
            </div>
            <ul className="space-y-1.5">
              {grouped[cat].map((item) => (
                <VaultRow
                  key={item.id}
                  item={item}
                  onPick={() => onPickFromVault(item)}
                  onToggleSignature={onToggleSignature}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function VaultRow({
  item, onPick, onToggleSignature,
}: {
  item: ChecklistItem
  onPick: () => void
  onToggleSignature?: (item: ChecklistItem, confirmed: boolean) => Promise<void>
}) {
  const { icon, label, color } = statusFor(item.status)
  const isLinked = !!item.linked_document_id
  const isMissing = item.status === 'manquant' || item.status === 'expire'

  return (
    <li
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-ds-bg-2"
      style={{ background: '#121213' }}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: '#F7F8F8' }}>
          {item.details || item.document_type_required}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs" style={{ color }}>{label}</span>
          {item.lot && (
            <span className="text-xs px-1.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#B4B5B8' }}>
              {item.lot.replace(/^lot/i, 'Lot ')}
            </span>
          )}
          {isLinked && (
            <span className="text-xs flex items-center gap-1" style={{ color: '#959597' }}>
              <FileText size={11} />
              Lié au coffre-fort
            </span>
          )}
        </div>
        <SignatureLigne item={item} onToggleSignature={onToggleSignature} />
      </div>

      {isMissing ? (
        <button
          type="button"
          onClick={onPick}
          className="glass-btn px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
          style={{ color: '#D8D9DB' }}
        >
          Choisir
        </button>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-ds-bg-2 shrink-0"
          style={{ border: '1px solid rgba(255,255,255,.07)', color: '#959597' }}
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
        icon: <CheckCircle2 size={16} style={{ color: '#6EE7A8' }} />,
        label: 'Conforme',
        color: '#6EE7A8',
      }
    case 'expire':
      return {
        icon: <AlertCircle size={16} style={{ color: '#F58E86' }} />,
        label: 'À renouveler',
        color: '#F58E86',
      }
    case 'expiration_proche':
      return {
        icon: <Clock size={16} style={{ color: '#959597' }} />,
        label: 'Expire bientôt',
        color: '#959597',
      }
    case 'warning':
      // C10 — présente mais problème (doc à vérifier / non classé / date illisible)
      return {
        icon: <AlertCircle size={16} style={{ color: '#D9A441' }} />,
        label: 'Présente — à vérifier',
        color: '#D9A441',
      }
    default:
      // « Manquant » = à faire, pas une alarme : le corail est réservé
      // au bandeau de synthèse et aux vraies alertes (expiré).
      return {
        icon: <Circle size={16} style={{ color: '#909195' }} />,
        label: 'À fournir',
        color: '#959597',
      }
  }
}
