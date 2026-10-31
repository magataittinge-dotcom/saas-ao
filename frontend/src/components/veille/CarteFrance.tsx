// Carte de France des avis ouverts : SVG sans bibliothèque. Une bulle par département qui en compte,
// clic = choisir (plusieurs possibles), molette et glisser = zoom et déplacement, flèches du clavier = passer d'un
// département à l'autre (un seul arrêt de tabulation, tabindex itinérant). Légère inclinaison à la souris,
// coupée si le système demande de réduire les animations et sur téléphone.
//
//   <CarteFrance comptes={{ '69': 12 }} selection={['69']} onSelection={(codes) => …} />
import './carte-france.css'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { DEPARTEMENTS, ENCARTS, PAYS_VOISINS, VIEWBOX, type Departement } from './donnees/departements'
import {
  basculerSelection, chiffreBulle, deplacer, estZoome, libelleDepartement, rayonBulle, voisinDansLaDirection, zoomer,
  type Cadre, type Direction,
} from '@/lib/carteFrance'
import { useMedia } from '@/hooks/useMedia'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'

export interface PropsCarteFrance {
  /** Nombre d'avis ouverts par code de département (les codes absents valent 0). */
  comptes: Record<string, number>
  /** Codes choisis. */
  selection: readonly string[]
  onSelection: (codes: string[]) => void
  className?: string
}

/** Nom d'un encart, coupé en deux lignes quand il est long (la case est étroite). */
const nomEncart = (code: string): string[] => {
  const nom = DEPARTEMENTS.find((d) => d.code === code)?.nom ?? code
  return nom === 'Saint-Pierre-et-Miquelon' ? ['Saint-Pierre-', 'et-Miquelon'] : [nom]
}

const PLEIN: Cadre = { ...VIEWBOX }
const REQUETE_TELEPHONE = '(max-width: 639px)'
const SEUIL_GLISSE = 4   // pixels : en dessous, c'est un clic

/* ── Un département : un bouton (rôle button, nom lu par les lecteurs d'écran) ───────────── */
export interface PropsDepartementCarte {
  dep: Departement
  compte: number
  choisi: boolean
  echelle: number            // pixels d'écran par unité du dessin
  /** Bulles un peu plus petites sur téléphone (la zone tactile reste de 44 px). */
  compact?: boolean
  focalisable: boolean       // le seul arrêt de tabulation de la carte
  onChoisir: (code: string, origine: 'clic' | 'clavier') => void
  onSurvol: (code: string | null) => void
}

export function DepartementCarteVue({ dep, compte, choisi, echelle, compact, focalisable, onChoisir, onSurvol }: PropsDepartementCarte) {
  const r = rayonBulle(compte) * (compact ? 0.78 : 1)
  const k = 1 / echelle
  return (
    <g
      role="button"
      tabIndex={focalisable ? 0 : -1}
      aria-label={libelleDepartement(dep.nom, compte)}
      aria-pressed={choisi}
      data-code={dep.code}
      data-compte={compte > 0 ? 'oui' : 'non'}
      className="cf-dep"
      onClick={() => onChoisir(dep.code, 'clic')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoisir(dep.code, 'clavier') } }}
      onPointerEnter={() => onSurvol(dep.code)}
      onPointerLeave={() => onSurvol(null)}
      onFocus={() => onSurvol(dep.code)}
      onBlur={() => onSurvol(null)}
    >
      <path className="cf-forme" d={dep.d} />
      {compte > 0 && (
        <g transform={`translate(${dep.cx} ${dep.cy}) scale(${k})`}>
          <circle className="cf-zone" r={Math.max(r, 22)} />
          <g className="cf-bulle-g" data-rayon={r}>
            <circle className="cf-bulle" r={r} />
            <text className="cf-chiffre">{chiffreBulle(compte)}</text>
          </g>
        </g>
      )}
    </g>
  )
}
const DepartementCarte = memo(DepartementCarteVue)

export default function CarteFrance({ comptes, selection, onSelection, className }: PropsCarteFrance) {
  const telephone = useMedia(REQUETE_TELEPHONE)
  const reduit = useMouvementReduit()
  const [cadre, setCadre] = useState<Cadre>(PLEIN)
  const [largeur, setLargeur] = useState(0)
  const [survol, setSurvol] = useState<string | null>(null)
  const [focus, setFocus] = useState<string>(() => {
    const premier = DEPARTEMENTS.find((d) => (comptes[d.code] ?? 0) > 0) ?? DEPARTEMENTS[0]
    return premier.code
  })
  const [deplace, setDeplace] = useState(false)

  const racine = useRef<HTMLDivElement>(null)
  const plan = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const geste = useRef<{ id: number; x0: number; y0: number; cadre: Cadre; actif: boolean } | null>(null)
  const clicApresGlisse = useRef(false)
  const cadreRef = useRef(cadre)
  cadreRef.current = cadre

  // Largeur affichée → échelle (pixels par unité) : le cadre garde les proportions du dessin entier.
  useEffect(() => {
    const el = racine.current
    if (!el) return
    setLargeur(Math.floor(el.clientWidth))
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(() => setLargeur(Math.floor(el.clientWidth)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  const echelle = largeur > 0 ? largeur / cadre.w : 1

  // Molette : zoom autour du pointeur. Écouteur natif : React attache « wheel » en passif.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const surMolette = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const fx = (e.clientX - r.left) / r.width
      const fy = (e.clientY - r.top) / r.height
      const facteur = Math.exp(-e.deltaY * 0.0015)
      setCadre((c) => zoomer(c, facteur, fx, fy, PLEIN))
    }
    el.addEventListener('wheel', surMolette, { passive: false })
    return () => el.removeEventListener('wheel', surMolette)
  }, [])

  const choisir = useCallback((code: string, origine: 'clic' | 'clavier') => {
    // Le clic qui suit un glisser n'est pas un choix (le clavier n'est jamais concerné).
    if (origine === 'clic' && clicApresGlisse.current) { clicApresGlisse.current = false; return }
    setFocus(code)
    onSelection(basculerSelection(selection, code))
  }, [selection, onSelection])

  // Glisser : le cadre suit le doigt ou la souris, seulement une fois le seuil passé (un simple clic reste un clic).
  const surAppui = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    geste.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cadre: cadreRef.current, actif: false }
  }
  const surMouvement = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = geste.current
    if (g && g.id === e.pointerId && estZoome(g.cadre, PLEIN)) {
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!g.actif && Math.hypot(dx, dy) > SEUIL_GLISSE) {
        g.actif = true
        svg.current?.setPointerCapture(e.pointerId)
        setDeplace(true)
      }
      if (g.actif) {
        const u = g.cadre.w / (svg.current?.getBoundingClientRect().width || 1)
        setCadre(deplacer(g.cadre, -dx * u, -dy * u, PLEIN))
      }
    }
    // Inclinaison : souris seulement, jamais sur téléphone, en mouvement réduit ni une fois la carte agrandie
    // (un calque incliné se redessine flou après un zoom).
    if (!telephone && !reduit && !estZoome(cadreRef.current, PLEIN) && e.pointerType === 'mouse' && racine.current && plan.current) {
      const r = racine.current.getBoundingClientRect()
      const nx = (e.clientX - r.left) / r.width - 0.5
      const ny = (e.clientY - r.top) / r.height - 0.5
      plan.current.style.transform = `rotateX(${(-ny * 5).toFixed(2)}deg) rotateY(${(nx * 6).toFixed(2)}deg)`
    }
  }
  const finGeste = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = geste.current
    if (g?.actif) {
      clicApresGlisse.current = true
      window.setTimeout(() => { clicApresGlisse.current = false }, 0)
      try { svg.current?.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
    }
    geste.current = null
    setDeplace(false)
  }
  const surSortie = () => { if (plan.current) plan.current.style.transform = '' }

  // Flèches : d'un département à l'autre ; un seul arrêt de tabulation.
  const surTouche = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const dir: Record<string, Direction> = { ArrowLeft: 'gauche', ArrowRight: 'droite', ArrowUp: 'haut', ArrowDown: 'bas' }
    const d = dir[e.key]
    if (!d) return
    const cible = (e.target as Element).closest('[data-code]')?.getAttribute('data-code')
    if (!cible) return
    e.preventDefault()
    const suivant = voisinDansLaDirection(DEPARTEMENTS, cible, d)
    if (!suivant) return
    setFocus(suivant)
    svg.current?.querySelector<SVGGElement>(`[data-code="${suivant}"]`)?.focus()
  }

  const zoomCentre = (facteur: number) => setCadre((c) => zoomer(c, facteur, 0.5, 0.5, PLEIN))
  const zoome = estZoome(cadre, PLEIN)
  useEffect(() => { if (zoome && plan.current) plan.current.style.transform = '' }, [zoome])

  const survolDep = survol ? DEPARTEMENTS.find((d) => d.code === survol) : undefined
  const infobulle = useMemo(() => {
    if (!survolDep || largeur <= 0) return null
    const px = (survolDep.cx - cadre.x) * echelle
    const py = (survolDep.cy - cadre.y) * echelle
    if (px < -20 || py < -20 || px > largeur + 20) return null
    return { gauche: Math.min(Math.max(px, 70), largeur - 70), haut: Math.max(py, 36), texte: libelleDepartement(survolDep.nom, comptes[survolDep.code] ?? 0) }
  }, [survolDep, cadre, echelle, largeur, comptes])

  const choisis = useMemo(() => new Set(selection), [selection])

  return (
    <div ref={racine} className={['cf', className].filter(Boolean).join(' ')} data-compact={telephone ? '' : undefined} onPointerLeave={surSortie}>
      <div ref={plan} className="cf-plan">
        <svg
          ref={svg}
          className="cf-svg"
          viewBox={`${cadre.x} ${cadre.y} ${cadre.w} ${cadre.h}`}
          style={{ aspectRatio: `${VIEWBOX.w} / ${VIEWBOX.h}`, touchAction: zoome ? 'none' : 'pan-y pinch-zoom' }}
          data-deplace={deplace ? '' : undefined}
          role="group"
          aria-label="Carte de France : choisir un ou plusieurs départements"
          onPointerDown={surAppui}
          onPointerMove={surMouvement}
          onPointerUp={finGeste}
          onPointerCancel={finGeste}
          onKeyDown={surTouche}
        >
          <path className="cf-voisins" d={PAYS_VOISINS} fillRule="evenodd" aria-hidden="true" />
          {ENCARTS.map((e) => (
            <g key={e.code} aria-hidden="true">
              <rect className="cf-encart" x={e.x} y={e.y} width={e.w} height={e.h} rx={8 / echelle} />
              {e.w * echelle >= 80 && <text className="cf-nom-encart" transform={`translate(${e.x + 8 / echelle} ${e.y + 16 / echelle}) scale(${1 / echelle})`}>
                {nomEncart(e.code).map((ligne, i) => <tspan key={ligne} x={0} dy={i === 0 ? 0 : 13}>{ligne}</tspan>)}
              </text>}
            </g>
          ))}
          {DEPARTEMENTS.map((d) => (
            <DepartementCarte
              key={d.code}
              dep={d}
              compte={comptes[d.code] ?? 0}
              choisi={choisis.has(d.code)}
              echelle={echelle}
              compact={telephone}
              focalisable={d.code === focus}
              onChoisir={choisir}
              onSurvol={setSurvol}
            />
          ))}
        </svg>
      </div>
      {infobulle && <div className="cf-infobulle" style={{ left: infobulle.gauche, top: infobulle.haut }} aria-hidden="true">{infobulle.texte}</div>}
      <div className="cf-outils">
        <button type="button" className="cf-outil" aria-label="Zoomer sur la carte" onClick={() => zoomCentre(1.6)}><Plus size={18} aria-hidden /></button>
        <button type="button" className="cf-outil" aria-label="Dézoomer" onClick={() => zoomCentre(1 / 1.6)} disabled={!zoome}><Minus size={18} aria-hidden /></button>
        <button type="button" className="cf-outil" aria-label="Recentrer la carte" onClick={() => setCadre(PLEIN)} disabled={!zoome}><RotateCcw size={16} aria-hidden /></button>
      </div>
    </div>
  )
}

