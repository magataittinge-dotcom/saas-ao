interface PaymentCardProps {
  cardType?: 'visa' | 'mastercard' | 'amex' | 'default'
  lastFour: string
  holderName: string
  expiryDate: string
}

const CARD_GRADIENTS: Record<string, string> = {
  visa: 'linear-gradient(135deg, #1A1F71, #2D3BB0, #4B6CB7)',
  mastercard: 'linear-gradient(135deg, #CC2131, #EB001B, #F79E1B)',
  amex: 'linear-gradient(135deg, #006FCF, #0055A5)',
  default: 'linear-gradient(135deg, #2563EB, #1E40AF)',
}

function CardLogo({ type }: { type: string }) {
  if (type === 'visa') {
    return (
      <span
        className="text-xl font-bold italic text-white/90 tracking-wide"
        style={{ fontFamily: 'serif' }}
      >
        VISA
      </span>
    )
  }
  if (type === 'mastercard') {
    return (
      <div className="flex items-center -space-x-2">
        <div className="w-7 h-7 rounded-full" style={{ background: '#EB001B', opacity: 0.9 }} />
        <div className="w-7 h-7 rounded-full" style={{ background: '#F79E1B', opacity: 0.9 }} />
      </div>
    )
  }
  if (type === 'amex') {
    return (
      <span
        className="text-sm font-bold text-white/90 tracking-widest"
        style={{ fontFamily: 'sans-serif' }}
      >
        AMEX
      </span>
    )
  }
  return (
    <div className="w-8 h-5 rounded" style={{ background: '#6B7280' }} />
  )
}

export default function PaymentCard({
  cardType = 'default',
  lastFour,
  holderName,
  expiryDate,
}: PaymentCardProps) {
  return (
    <div
      className="relative overflow-hidden transition-transform duration-300 cursor-default select-none group"
      style={{
        width: 340,
        height: 200,
        borderRadius: '20px',
        background: CARD_GRADIENTS[cardType] ?? CARD_GRADIENTS.default,
        perspective: '1000px',
        boxShadow: '14px 17px 40px 4px rgba(0,0,0,0.30), 0 0 20px rgba(34,211,238,0.1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'perspective(800px) rotateY(2deg) scale(1.01)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'perspective(800px) rotateY(0deg) scale(1)'
      }}
    >
      {/* Glassmorphism overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, #CBD5E1 0%, transparent 50%, #F1F5F9 100%)',
        }}
      />
      {/* Animated shine */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
      >
        <div
          className="absolute -inset-full"
          style={{
            background: 'linear-gradient(135deg, transparent 40%, #F1F5F9 50%, transparent 60%)',
            animation: 'card-shine 6s ease-in-out infinite',
          }}
        />
      </div>

      {/* Chip */}
      <div
        className="absolute top-6 left-6 w-10 h-7 rounded-md"
        style={{
          background: 'linear-gradient(135deg, #D4AF37 0%, #F5D76E 50%, #D4AF37 100%)',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3)',
        }}
      >
        <div
          className="absolute inset-0 rounded-md"
          style={{
            background: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(0,0,0,0.08) 4px, rgba(0,0,0,0.08) 5px)',
          }}
        />
      </div>

      {/* Logo */}
      <div className="absolute top-5 right-6">
        <CardLogo type={cardType} />
      </div>

      {/* Card number */}
      <div
        className="absolute left-6 text-white/90 text-lg font-medium font-mono"
        style={{
          bottom: 68,
          letterSpacing: '0.25em',
        }}
      >
        •••• •••• •••• {lastFour}
      </div>

      {/* Holder name */}
      <div
        className="absolute bottom-5 left-6 text-sm uppercase text-white/70 tracking-wider"
        style={{ fontFamily: '"Geist Sans", system-ui, sans-serif' }}
      >
        {holderName}
      </div>

      {/* Expiry */}
      <div className="absolute bottom-5 right-6">
        <div className="text-[10px] uppercase text-white/40 mb-0.5">Expires</div>
        <div
          className="text-sm text-white/80 font-medium font-mono"
        >
          {expiryDate}
        </div>
      </div>
    </div>
  )
}
