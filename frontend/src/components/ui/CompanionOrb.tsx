import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, SyntheticEvent } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════
 * COMPANION ORB — la tête IA Synorix, en orbe circulaire
 * Clips webm (fond noir) rendus en mix-blend-mode: screen :
 * le noir disparaît sur l'UI sombre, seule la lumière reste.
 * Le composant insère lui-même les clips de transition
 * (réveil / endormissement) selon la continuité des yeux.
 * prefers-reduced-motion ou erreur vidéo → poster statique.
 * ═══════════════════════════════════════════════════════════════
 */

/** États logiques — pilotés par l'app (companionStore, SSE analyse…) */
export type CompanionState = 'veille' | 'reveil' | 'analyse' | 'succes' | 'sommeil'

/** Clips physiques dans /public/assets */
type Clip = 'veille' | 'reveil' | 'analyse-boucle' | 'succes' | 'sommeil'

const SRC: Record<Clip, string> = {
  veille:           '/assets/tete-veille.webm',
  reveil:           '/assets/tete-reveil.webm',
  'analyse-boucle': '/assets/tete-analyse-boucle.webm',
  succes:           '/assets/tete-succes.webm',
  sommeil:          '/assets/tete-sommeil.webm',
}
const LOOPS: Record<Clip, boolean> = {
  veille: true,
  'analyse-boucle': true,
  reveil: false,
  succes: false,
  sommeil: false,
}
/** Yeux ouverts à la FIN du clip ? (continuité des transitions) */
const ENDS_OPEN: Record<Clip, boolean> = {
  veille: false,
  reveil: true,
  'analyse-boucle': true,
  succes: true,
  sommeil: false,
}

const POSTER_CLOSED = '/assets/tete-fermee-poster.webp'
const POSTER_OPEN = '/assets/tete-ouverte-poster.webp'

/** Chemin de clips vers l'état cible, selon l'état des yeux. */
function planQueue(eyesOpen: boolean, target: CompanionState): Clip[] {
  if (target === 'veille' || target === 'sommeil') {
    return eyesOpen ? ['sommeil', 'veille'] : ['veille']
  }
  if (target === 'reveil' || target === 'analyse') {
    return eyesOpen ? ['analyse-boucle'] : ['reveil', 'analyse-boucle']
  }
  // succes : vague ambre, puis retour au calme
  return eyesOpen
    ? ['succes', 'sommeil', 'veille']
    : ['reveil', 'succes', 'sommeil', 'veille']
}

interface Slots {
  front: 'a' | 'b'
  a: Clip | null
  b: Clip | null
  /** le calque avant est décodé → crossfade lancé */
  ready: boolean
}

interface CompanionOrbProps {
  state?: CompanionState
  /** Diamètre en px */
  size?: number
  /** Zoom du clip dans le cercle (cadrage du visage) */
  zoom?: number
  className?: string
  title?: string
}

export default function CompanionOrb({
  state = 'veille',
  size = 36,
  zoom = 1.12,
  className = '',
  title,
}: CompanionOrbProps) {
  const prefersReduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const [slots, setSlots] = useState<Slots>({ front: 'a', a: null, b: null, ready: false })
  const [failed, setFailed] = useState(false)

  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const queueRef = useRef<Clip[]>([])
  const eyesOpenRef = useRef(false)
  const startedRef = useRef(false)
  const refA = useRef<HTMLVideoElement | null>(null)
  const refB = useRef<HTMLVideoElement | null>(null)

  const showPosterOnly = prefersReduced || failed

  /** Charge `next` dans le calque arrière et le passe devant (crossfade). */
  const startClip = useCallback((next: Clip) => {
    setSlots((s) => {
      const current = s.front === 'a' ? s.a : s.b
      if (current === next) return s
      const back = s.front === 'a' ? 'b' : 'a'
      return {
        front: back,
        a: back === 'a' ? next : s.a,
        b: back === 'b' ? next : s.b,
        ready: false,
      }
    })
  }, [])

  // État logique → file de clips
  useEffect(() => {
    if (showPosterOnly) return
    const q = planQueue(eyesOpenRef.current, state)
    queueRef.current = q
    startClip(q[0])
  }, [state, showPosterOnly, startClip])

  // Une fois le crossfade terminé, on démonte le calque arrière
  useEffect(() => {
    if (!slots.ready) return
    const t = window.setTimeout(() => {
      setSlots((s) => {
        if (!s.ready) return s
        if (s.front === 'a' && s.b !== null) return { ...s, b: null }
        if (s.front === 'b' && s.a !== null) return { ...s, a: null }
        return s
      })
    }, 340)
    return () => window.clearTimeout(t)
  }, [slots.ready, slots.front])

  const handleCanPlay = useCallback(
    (slot: 'a' | 'b') => (e: SyntheticEvent<HTMLVideoElement>) => {
      if (slotsRef.current.front !== slot) return
      startedRef.current = true
      e.currentTarget.play().catch(() => {})
      setSlots((s) => (s.front === slot && !s.ready ? { ...s, ready: true } : s))
    },
    [],
  )

  const handleEnded = useCallback(
    (slot: 'a' | 'b') => () => {
      const s = slotsRef.current
      if (s.front !== slot) return
      const current = slot === 'a' ? s.a : s.b
      if (!current) return
      eyesOpenRef.current = ENDS_OPEN[current]
      const q = queueRef.current
      if (q[0] === current && q.length > 1) {
        q.shift()
        startClip(q[0])
      }
    },
    [startClip],
  )

  const posterFor = (s: CompanionState) =>
    s === 'analyse' || s === 'succes' || s === 'reveil' ? POSTER_OPEN : POSTER_CLOSED

  const layer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: `scale(${zoom})`,
    mixBlendMode: 'screen',
    pointerEvents: 'none',
  }

  const renderVideo = (slot: 'a' | 'b') => {
    const clip = slot === 'a' ? slots.a : slots.b
    if (!clip) return null
    const isFront = slots.front === slot
    return (
      <video
        ref={slot === 'a' ? refA : refB}
        src={SRC[clip]}
        muted
        playsInline
        autoPlay
        loop={LOOPS[clip]}
        onCanPlay={handleCanPlay(slot)}
        onEnded={handleEnded(slot)}
        onError={() => setFailed(true)}
        style={{
          ...layer,
          zIndex: isFront ? 2 : 1,
          opacity: isFront ? (slots.ready ? 1 : 0) : slots.ready ? 0 : 1,
          transition: 'opacity .26s ease',
        }}
      />
    )
  }

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden="true"
    >
      {/* halo respirant pendant l'analyse */}
      {state === 'analyse' && !showPosterOnly && (
        <span
          className="absolute rounded-full animate-pulse-glow pointer-events-none"
          style={{
            inset: -7,
            background:
              'radial-gradient(50% 50% at 50% 50%, rgba(255,255,255,.16), transparent 72%)',
          }}
        />
      )}

      <div className="absolute inset-0 rounded-full overflow-hidden">
        {showPosterOnly ? (
          <img src={posterFor(state)} alt="" draggable={false} style={layer} />
        ) : (
          <>
            {/* poster de fond avant le premier décodage */}
            <img
              src={POSTER_CLOSED}
              alt=""
              draggable={false}
              style={{
                ...layer,
                opacity: startedRef.current ? 0 : 1,
                transition: 'opacity .24s ease',
              }}
            />
            {renderVideo('a')}
            {renderVideo('b')}
          </>
        )}
      </div>

      {/* filet lumineux */}
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)' }}
      />
    </div>
  )
}
