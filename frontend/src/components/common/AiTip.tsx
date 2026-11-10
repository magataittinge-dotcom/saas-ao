import { useState } from 'react'
import { Message, type TonMessage } from '@/components/ui/message'

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

const TONS: Record<TipVariant, TonMessage> = { info: 'info', warning: 'attention', success: 'succes' }

/** ALIAS MINCE. Un conseil qui se referme : c'est le `Message` du système (components/ui/message.tsx). */
export default function AiTip({ tip, onDismiss }: Props) {
  const [visible, setVisible] = useState(true)
  if (!visible) return null
  return (
    <Message ton={TONS[tip.variant]} onFermer={() => { setVisible(false); onDismiss(tip.id) }}>
      <span className="text-fg">{tip.text}</span>
    </Message>
  )
}

/** Au plus `max` conseils, dans l'ordre : à surveiller, information, fait. Les conseils refermés sont écartés. */
export function AiTipsBlock({ tips, dismissed, onDismiss, max = 2 }: {
  tips: TipData[]
  dismissed: Set<string>
  onDismiss: (id: string) => void
  max?: number
}) {
  const PRIORITY: Record<TipVariant, number> = { warning: 0, info: 1, success: 2 }
  const visible = tips.filter((t) => !dismissed.has(t.id)).sort((a, b) => PRIORITY[a.variant] - PRIORITY[b.variant]).slice(0, max)
  if (visible.length === 0) return null
  return <div className="space-y-2">{visible.map((tip) => <AiTip key={tip.id} tip={tip} onDismiss={onDismiss} />)}</div>
}
