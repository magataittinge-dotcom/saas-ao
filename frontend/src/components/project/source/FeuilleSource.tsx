import { useEffect, useRef, useState, type ReactNode } from 'react'
import { obtenirApercu, type VueApercu } from '@/services/sources'
import { centreVertical, defilementCentre, type Rect } from '@/lib/ancre'
import { useMedia, REQUETE_MOUVEMENT_REDUIT } from '@/hooks/useMedia'

/** Les rectangles de l'ancre posés sur une page (image ou canevas) : en pourcentages de la page,
 *  donc justes à toute largeur. Décoratifs pour un lecteur d'écran : le texte du passage est dans
 *  la citation. */
export function CalqueSurligne({ rects }: { rects: readonly Rect[] }) {
  return (
    <>
      {rects.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="source-surligne"
          data-premier={i === 0 ? 'oui' : undefined}
          style={{
            left: `${r[0] * 100}%`, top: `${r[1] * 100}%`,
            width: `${(r[2] - r[0]) * 100}%`, height: `${(r[3] - r[1]) * 100}%`,
          }}
        />
      ))}
    </>
  )
}

/** Fait défiler `conteneur` pour centrer le passage (le milieu de ses rectangles) dans la fenêtre. */
export function useCentrer(
  conteneurRef: React.RefObject<HTMLElement>,
  feuilleRef: React.RefObject<HTMLElement>,
  rects: readonly Rect[],
  pret: boolean,
  cle: string,
): void {
  const reduit = useMedia(REQUETE_MOUVEMENT_REDUIT)
  useEffect(() => {
    const conteneur = conteneurRef.current
    const feuille = feuilleRef.current
    const fraction = centreVertical(rects)
    if (!pret || !conteneur || !feuille || fraction === null) return
    const haut = defilementCentre(fraction, feuille.offsetHeight, feuille.offsetTop, conteneur.clientHeight)
    conteneur.scrollTo({ top: haut, behavior: reduit ? 'auto' : 'smooth' })
    // une fois par page affichée
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret, cle])
}

/** Récupère une image du serveur (authentifiée) et la rend en URL locale le temps de l'affichage. */
export function useImageSource(id: string, vue: VueApercu, largeur: number) {
  const [etat, setEtat] = useState<{ url: string | null; echec: boolean }>({ url: null, echec: false })
  const [essai, setEssai] = useState(0)
  useEffect(() => {
    let annule = false
    let url: string | null = null
    setEtat({ url: null, echec: false })
    obtenirApercu(id, vue, largeur)
      .then((blob) => {
        if (annule) return
        url = URL.createObjectURL(blob)
        setEtat({ url, echec: false })
      })
      .catch(() => { if (!annule) setEtat({ url: null, echec: true }) })
    return () => { annule = true; if (url) URL.revokeObjectURL(url) }
  }, [id, vue, largeur, essai])
  return { ...etat, reessayer: () => setEssai((n) => n + 1) }
}

interface ImageProps {
  exigenceId: string
  vue: VueApercu
  largeur: number
  alt: string
  rects: readonly Rect[]
  onClick?: () => void
  /** Texte du bouton quand l'image est cliquable (lecteurs d'écran). */
  intitule?: string
  conteneurRef?: React.RefObject<HTMLElement>
  centrer?: boolean
  cle?: string
  children?: ReactNode
}

/** Une page (ou la loupe) en image, avec les rectangles de l'ancre par-dessus. */
export function ImageSource({
  exigenceId, vue, largeur, alt, rects, onClick, intitule, conteneurRef, centrer = false, cle = '', children,
}: ImageProps) {
  const { url, echec, reessayer } = useImageSource(exigenceId, vue, largeur)
  const feuilleRef = useRef<HTMLDivElement>(null)
  const [chargee, setChargee] = useState(false)
  useEffect(() => { setChargee(false) }, [url])
  useCentrer(conteneurRef ?? { current: null }, feuilleRef, centrer ? rects : [], chargee, `${exigenceId}|${vue}|${cle}`)

  if (echec) {
    return (
      <div className="source-vide" role="status">
        <p>L&rsquo;aperçu de cette page n&rsquo;a pas pu s&rsquo;afficher.</p>
        <button type="button" onClick={reessayer} className="source-bouton">Réessayer</button>
      </div>
    )
  }
  const image = (
    <div ref={feuilleRef} className="source-feuille" data-chargee={chargee ? 'oui' : 'non'}>
      {url ? (
        <img src={url} alt={alt} onLoad={() => setChargee(true)} draggable={false} />
      ) : (
        <div className="source-squelette" aria-hidden="true" />
      )}
      {chargee && <CalqueSurligne rects={rects} />}
      {children}
    </div>
  )
  if (!onClick) return image
  return (
    <button type="button" onClick={onClick} className="source-feuille-bouton" aria-label={intitule}>
      {image}
    </button>
  )
}
