import { useState } from 'react'
import { Lightbulb, AlertTriangle, CheckCircle2, X } from 'lucide-react'

export type TipVariant = 'info' | 'warning' | 'success'

export interface TipData {
  id: string
  variant: TipVariant
  text: string
}

interface Props {
  tip: TipData
  onDismiss: (id: string) => void
}

const VARIANT_CONFIG: Record<TipVariant, {
  icon: typeof Lightbulb
  bg: string
  border: string
  iconColor: string
  textColor: string
}> = {
  info: {
    icon: Lightbulb,
    bg: 'rgba(34,211,238,0.06)',
    border: 'rgba(34,211,238,0.20)',
    iconColor: '#22D3EE',
    textColor: '#E7EAEE',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'rgba(248,113,113,0.06)',
    border: 'rgba(248,113,113,0.20)',
    iconColor: '#F87171',
    textColor: '#991B1B',
  },
  success: {
    icon: CheckCircle2,
    bg: 'rgba(34,211,238,0.06)',
    border: 'rgba(34,211,238,0.20)',
    iconColor: '#22D3EE',
    textColor: '#E7EAEE',
  },
}

export default function AiTip({ tip, onDismiss }: Props) {
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  const cfg = VARIANT_CONFIG[tip.variant]
  const Icon = cfg.icon

  const handleDismiss = () => {
    setVisible(false)
    onDismiss(tip.id)
  }

  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3 rounded-lg animate-tip-in"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <Icon size={15} className="shrink-0 mt-0.5" style={{ color: cfg.iconColor }} />
      <p className="text-sm font-medium leading-relaxed flex-1" style={{ color: cfg.textColor }}>
        {tip.text}
      </p>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-[#232730] transition-colors"
        style={{ color: cfg.iconColor, opacity: 0.5 }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

/**
 * Renders up to `max` tips, prioritized by variant: warning > info > success.
 * Filters out dismissed tips.
 */
export function AiTipsBlock({
  tips,
  dismissed,
  onDismiss,
  max = 2,
}: {
  tips: TipData[]
  dismissed: Set<string>
  onDismiss: (id: string) => void
  max?: number
}) {
  const PRIORITY: Record<TipVariant, number> = { warning: 0, info: 1, success: 2 }

  const visible = tips
    .filter((t) => !dismissed.has(t.id))
    .sort((a, b) => PRIORITY[a.variant] - PRIORITY[b.variant])
    .slice(0, max)

  if (visible.length === 0) return null

  return (
    <div className="space-y-2">
      {visible.map((tip) => (
        <AiTip key={tip.id} tip={tip} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
