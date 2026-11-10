// Carte de France des avis ouverts : SVG sans bibliothèque. Une bulle par département qui en compte,
// clic = choisir (plusieurs possibles), molette et glisser = zoom et déplacement, flèches du clavier = passer d'un
// département à l'autre (un seul arrêt de tabulation, tabindex itinérant). Légère inclinaison à la souris,
// coupée si le système demande de réduire les animations et sur téléphone.
// Les bulles qui se chevauchent à l'écran (Paris et la petite couronne) forment une seule bulle : clic ou Entrée =
// zoom sur le groupe, puis les bulles redeviennent individuelles. Les départements du groupe restent choisissables
// (contour, flèches du clavier).
//
//   <CarteFrance comptes={{ '69': 12 }} selection={['69']} onSelection={(codes) => …} />
import './carte-france.css'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { BoutonIcone } from '@/components/ui/bouton'
import { DEPARTEMENTS, ENCARTS, PAYS_VOISINS, VIEWBOX, type Departement } from './donnees/departements'
import {
  basculerSelection, cadreSurGroupe, chiffreBulle, cleGroupe, deplacer, estGroupe, estZoome, libelleDepartement, libelleGroupe,
  rayonAffiche, regrouperBulles, voisinDansLaDirection, zoomer,
  type BulleDep, type Cadre, type Direction, type GroupeBulles,
} from '@/lib/carteFrance'
import { useMedia } from '@/hooks/useMedia'

// Les outils de la carte : le bouton à icône du système, posé sur la carte (papier flottant, trait de champ).
const OUTIL = 'border border-bord-champ bg-surface-pop text-fg hover:bg-surface-2'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'

export interface PropsCarteFrance {
  /** Nombre d'avis ouverts par code de département (les codes absents valent 0). */
  comptes: Record<string, number>
  /** Codes choisis. */
  selection: readonly string[]
  onSelection: (codes: string[]) => void
  className?: string
  /** Point de départ (tests, rendu serveur) : largeur affichée connue, cadre déjà zoomé. */
  initial?: { largeur?: number; cadre?: Cadre }
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
  /** Sa bulle est absorbée par celle d'un groupe : seul le contour reste. */
  groupee?: boolean
  focalisable: boolean       // le seul arrêt de tabulation de la carte
  onChoisir: (code: string, origine: 'clic' | 'clavier') => void
  onSurvol: (code: string | null) => void
}

export function DepartementCarteVue({ dep, compte, choisi, echelle, compact, groupee, focalisable, onChoisir, onSurvol }: PropsDepartementCarte) {
  const r = rayonAffiche(compte, compact)
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
      {compte > 0 && !groupee && (
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

/* ── Un groupe de départements : une seule bulle, clic ou Entrée = zoomer dessus ───────────── */
export interface PropsGroupeCarte {
  groupe: GroupeBulles
  noms: readonly string[]
  choisi: boolean            // l'un de ses départements est choisi
  echelle: number
  onZoomer: (groupe: GroupeBulles, origine: 'clic' | 'clavier') => void
  onSurvol: (cle: string | null) => void
}

export function GroupeCarteVue({ groupe, noms, choisi, echelle, onZoomer, onSurvol }: PropsGroupeCarte) {
  const cle = cleGroupe(groupe.codes)
  const k = 1 / echelle
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={libelleGroupe(noms, groupe.compte)}
      data-groupe={cle}
      data-choisi={choisi ? '' : undefined}
      className="cf-groupe"
      onClick={() => onZoomer(groupe, 'clic')}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onZoomer(groupe, 'clavier') } }}
      onPointerEnter={() => onSurvol(cle)}
      onPointerLeave={() => onSurvol(null)}
      onFocus={() => onSurvol(cle)}
      onBlur={() => onSurvol(null)}
    >
      <g transform={`translate(${groupe.cx} ${groupe.cy}) scale(${k})`}>
        <circle className="cf-zone" r={Math.max(groupe.rayon, 22)} />
        <g className="cf-bulle-g" data-rayon={groupe.rayon}>
          <circle className="cf-bulle" r={groupe.rayon} />
          <text className="cf-chiffre">{chiffreBulle(groupe.compte)}</text>
        </g>
      </g>
    </g>
  )
}
const GroupeCarte = memo(GroupeCarteVue)

const DUREE_ZOOM = 320   // ms

export default function CarteFrance({ comptes, selection, onSelection, className, initial }: PropsCarteFrance) {
  const telephone = useMedia(REQUETE_TELEPHONE)
  const reduit = useMouvementReduit()
  const [cadre, setCadre] = useState<Cadre>(initial?.cadre ?? PLEIN)
  const [largeur, setLargeur] = useState(initial?.largeur ?? 0)
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
  const animation = useRef<number | null>(null)

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

  const arreterAnimation = useCallback(() => {
    if (animation.current !== null) { cancelAnimationFrame(animation.current); animation.current = null }
  }, [])
  useEffect(() => arreterAnimation, [arreterAnimation])

  // Glisse le cadre vers la cible (320 ms) ; d'un coup si le système demande de réduire les animations.
  const aller = useCallback((cible: Cadre) => {
    arreterAnimation()
    const depart = cadreRef.current
    if (reduit || typeof requestAnimationFrame === 'undefined') { setCadre(cible); return }
    const t0 = performance.now()
    const pas = (t: number) => {
      const p = Math.min((t - t0) / DUREE_ZOOM, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setCadre({
        x: depart.x + (cible.x - depart.x) * e, y: depart.y + (cible.y - depart.y) * e,
        w: depart.w + (cible.w - depart.w) * e, h: depart.h + (cible.h - depart.h) * e,
      })
      animation.current = p < 1 ? requestAnimationFrame(pas) : null
    }
    animation.current = requestAnimationFrame(pas)
  }, [reduit, arreterAnimation])

  // Molette : zoom autour du pointeur. Écouteur natif : React attache « wheel » en passif.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const surMolette = (e: WheelEvent) => {
      e.preventDefault()
      arreterAnimation()
      const r = el.getBoundingClientRect()
      const fx = (e.clientX - r.left) / r.width
      const fy = (e.clientY - r.top) / r.height
      const facteur = Math.exp(-e.deltaY * 0.0015)
      setCadre((c) => zoomer(c, facteur, fx, fy, PLEIN))
    }
    el.addEventListener('wheel', surMolette, { passive: false })
    return () => el.removeEventListener('wheel', surMolette)
  }, [arreterAnimation])

  const choisir = useCallback((code: string, origine: 'clic' | 'clavier') => {
    // Le clic qui suit un glisser n'est pas un choix (le clavier n'est jamais concerné).
    if (origine === 'clic' && clicApresGlisse.current) { clicApresGlisse.current = false; return }
    setFocus(code)
    onSelection(basculerSelection(selection, code))
  }, [selection, onSelection])

  // Glisser : le cadre suit le doigt ou la souris, seulement une fois le seuil passé (un simple clic reste un clic).
  const surAppui = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    arreterAnimation()
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

  const zoomCentre = (facteur: number) => { arreterAnimation(); setCadre((c) => zoomer(c, facteur, 0.5, 0.5, PLEIN)) }
  const zoome = estZoome(cadre, PLEIN)
  useEffect(() => { if (zoome && plan.current) plan.current.style.transform = '' }, [zoome])

  const nomsDe = useCallback((codes: readonly string[]) => codes.map((c) => DEPARTEMENTS.find((d) => d.code === c)?.nom ?? c), [])
  const choisis = useMemo(() => new Set(selection), [selection])

  // Bulles qui se chevauchent à l'écran → un groupe (tant que la largeur affichée est inconnue, aucun groupe).
  const bulles = useMemo<BulleDep[]>(
    () => DEPARTEMENTS.filter((d) => (comptes[d.code] ?? 0) > 0).map((d) => ({ code: d.code, cx: d.cx, cy: d.cy, compte: comptes[d.code] })),
    [comptes],
  )
  const groupes = useMemo(
    () => (largeur > 0 ? regrouperBulles(bulles, echelle, { compact: telephone }).filter(estGroupe) : []),
    [bulles, echelle, largeur, telephone],
  )
  const groupees = useMemo(() => new Set(groupes.flatMap((g) => g.codes)), [groupes])

  const infobulle = useMemo(() => {
    if (!survol || largeur <= 0) return null
    const groupe = groupes.find((g) => cleGroupe(g.codes) === survol)
    const survolDep = groupe ? undefined : DEPARTEMENTS.find((d) => d.code === survol)
    const cible = groupe ?? survolDep
    if (!cible) return null
    const texte = groupe ? libelleGroupe(nomsDe(groupe.codes), groupe.compte) : libelleDepartement(survolDep!.nom, comptes[survolDep!.code] ?? 0)
    const px = (cible.cx - cadre.x) * echelle
    const py = (cible.cy - cadre.y) * echelle
    if (px < -20 || py < -20 || px > largeur + 20) return null
    const demi = Math.min(groupe ? 150 : 70, largeur / 2)   // le texte d'un groupe est long : il passe à la ligne (300 px au plus)
    return { gauche: Math.min(Math.max(px, demi), largeur - demi), haut: Math.max(py, 36), texte }
  }, [survol, groupes, cadre, echelle, largeur, comptes, nomsDe])

  const zoomerSurGroupe = useCallback((g: GroupeBulles, origine: 'clic' | 'clavier') => {
    if (origine === 'clic' && clicApresGlisse.current) { clicApresGlisse.current = false; return }
    // Au clavier, le groupe disparaît sous le zoom : le focus passe à son premier département (son contour reste dans la page).
    if (origine === 'clavier') { setFocus(g.codes[0]); svg.current?.querySelector<SVGGElement>(`[data-code="${g.codes[0]}"]`)?.focus() }
    aller(cadreSurGroupe(bulles, g.codes, largeur, PLEIN, { compact: telephone }))
  }, [bulles, largeur, telephone, aller])

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
              groupee={groupees.has(d.code)}
              focalisable={d.code === focus}
              onChoisir={choisir}
              onSurvol={setSurvol}
            />
          ))}
          {groupes.map((g) => (
            <GroupeCarte
              key={cleGroupe(g.codes)}
              groupe={g}
              noms={nomsDe(g.codes)}
              choisi={g.codes.some((c) => choisis.has(c))}
              echelle={echelle}
              onZoomer={zoomerSurGroupe}
              onSurvol={setSurvol}
            />
          ))}
        </svg>
      </div>
      {infobulle && <div className="cf-infobulle" style={{ left: infobulle.gauche, top: infobulle.haut }} aria-hidden="true">{infobulle.texte}</div>}
      <div className="cf-outils">
        <BoutonIcone className={OUTIL} libelle="Zoomer sur la carte" onClick={() => zoomCentre(1.6)}><Plus strokeWidth={1.5} aria-hidden /></BoutonIcone>
        <BoutonIcone className={OUTIL} libelle="Dézoomer" onClick={() => zoomCentre(1 / 1.6)} disabled={!zoome}><Minus strokeWidth={1.5} aria-hidden /></BoutonIcone>
        <BoutonIcone className={OUTIL} libelle="Recentrer la carte" onClick={() => { arreterAnimation(); setCadre(PLEIN) }} disabled={!zoome}><RotateCcw strokeWidth={1.5} aria-hidden /></BoutonIcone>
      </div>
    </div>
  )
}

