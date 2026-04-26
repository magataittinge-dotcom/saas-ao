import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

const VARIANT_COLORS = {
  upload:     { stroke: '#0EA5E9', glow: 'rgba(14,165,233,0.4)',  text: '#0EA5E9' },
  analysis:   { stroke: '#06B6D4', glow: 'rgba(6,182,212,0.4)',   text: '#06B6D4' },
  generation: { stroke: '#14B8A6', glow: 'rgba(20,184,166,0.4)',  text: '#14B8A6' },
}

interface Props {
  progress: number
  label: string
  sublabel?: string
  variant?: 'upload' | 'analysis' | 'generation'
}

export default function LoadingProgress({
  progress,
  label,
  sublabel,
  variant = 'upload',
}: Props) {
  const [showCheck, setShowCheck] = useState(false)
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; color: string }[]>([])
  const colors = VARIANT_COLORS[variant]

  const RADIUS = 70
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS
  const clamped = Math.min(Math.max(progress, 0), 100)
  const offset = CIRCUMFERENCE * (1 - clamped / 100)

  useEffect(() => {
    if (clamped >= 100 && !showCheck) {
      const t = setTimeout(() => {
        setShowCheck(true)
        // Spawn confetti particles
        setParticles(
          Array.from({ length: 12 }, (_, i) => ({
            id: i,
            x: Math.cos((i * 30 * Math.PI) / 180) * 55,
            y: Math.sin((i * 30 * Math.PI) / 180) * 55,
            color: ['#0EA5E9', '#0284C7', '#38BDF8', '#0EA5E9'][i % 4],
          })),
        )
        setTimeout(() => setParticles([]), 900)
      }, 300)
      return () => clearTimeout(t)
    }
    if (clamped < 100) {
      setShowCheck(false)
      setParticles([])
    }
  }, [clamped, showCheck])

  return (
    <div className="flex flex-col items-center gap-5">
      {/* SVG circle */}
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle
            cx="80" cy="80" r={RADIUS}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="8"
          />
          <circle
            cx="80" cy="80" r={RADIUS}
            fill="none"
            stroke={showCheck ? '#0EA5E9' : colors.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
              filter: `drop-shadow(0 0 8px ${showCheck ? 'rgba(14,165,233,0.5)' : colors.glow})`,
            }}
          />
        </svg>

        {/* Center */}
        <div className="absolute inset-0 flex items-center justify-center">
          {showCheck ? (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(16,185,129,0.15)',
                animation: 'scale-in 0.3s ease forwards',
              }}
            >
              <Check size={32} className="text-ds-success" strokeWidth={2.5} />
            </div>
          ) : (
            <span
              className="text-2xl font-bold font-mono"
              style={{ color: colors.text }}
            >
              {Math.round(clamped)}%
            </span>
          )}
        </div>

        {/* Pulse when < 100 */}
        {clamped < 100 && (
          <div
            className="absolute inset-2 rounded-full"
            style={{
              border: `2px solid ${colors.stroke}`,
              opacity: 0.12,
              animation: 'pulse-ring 2s ease-in-out infinite',
            }}
          />
        )}

        {/* Confetti particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{
              left: '50%',
              top: '50%',
              background: p.color,
              animation: 'confetti-burst 0.8s ease-out forwards',
              '--tx': `${p.x}px`,
              '--ty': `${p.y}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Labels */}
      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {sublabel && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sublabel}</p>
        )}
      </div>
    </div>
  )
}
