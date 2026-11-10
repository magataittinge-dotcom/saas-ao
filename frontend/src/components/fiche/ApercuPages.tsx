// Zone « Aperçu » : le document tel qu'il sera téléchargé, page par page. Sans rendu exact (LibreOffice indisponible), l'aperçu
// HTML simplifié (FichePreview) prend le relais avec sa ligne d'explication. L'attente se dit en mots : aucune roue.
import { useState } from 'react'
import FichePreview from '@/components/fiche/FichePreview'
import type { PageImage } from '@/components/fiche/useApercuFiche'
import { apercuSimplifie, enMiseAJour, MESSAGE_INDISPONIBLE, type EtatApercu } from '@/lib/apercuFiche'
import type { FicheBordereau, FicheDonnees, PaletteFiche } from '@/lib/fiche'

interface Props {
  etat: EtatApercu
  pages: PageImage[]
  /** Quelque chose attend d'être enregistré ou pris en compte : l'aperçu est en retard sur l'écran. */
  enRetard: boolean
  donnees: FicheDonnees
  bordereau: FicheBordereau
  palette: PaletteFiche
  logoSrc: string | null
}

export const TEXTE_MISE_A_JOUR = "Mise à jour de l’aperçu…"

export default function ApercuPages({ etat, pages, enRetard, donnees, bordereau, palette, logoSrc }: Props) {
  const [ratio, setRatio] = useState(210 / 297)
  const maj = enMiseAJour(etat) || enRetard
  const simplifie = apercuSimplifie(etat)
  const total = pages.length

  if (simplifie) {
    return (
      <div className="space-y-3" data-apercu-simplifie>
        <p className="text-sm text-fg-2" data-ligne-simplifie>
          {MESSAGE_INDISPONIBLE}
        </p>
        <FichePreview donnees={donnees} bordereau={bordereau} palette={palette} logoSrc={logoSrc} />
      </div>
    )
  }

  return (
    <div className="relative" data-apercu-pages aria-busy={maj}>
      {pages.length === 0 ? (
        <div
          className="grid w-full place-items-center rounded-md border border-bord bg-surface-1 text-sm text-fg-2"
          style={{ aspectRatio: String(ratio) }} data-apercu-attente aria-hidden
        >
          <span>{TEXTE_MISE_A_JOUR}</span>
        </div>
      ) : (
        <ol className={`grid gap-4 transition-opacity duration-survol ease-survol motion-reduce:transition-none ${maj ? 'opacity-50' : ''}`}>
          {pages.map((p) => (
            <li key={p.numero} className="overflow-hidden rounded-md border border-bord bg-surface-0 shadow-card" style={{ aspectRatio: String(ratio) }}>
              {p.src ? (
                <img
                  src={p.src} alt={`Page ${p.numero} sur ${total} de la fiche`}
                  loading={p.numero > 1 ? 'lazy' : 'eager'} decoding="async"
                  onLoad={p.numero === 1 ? (e) => {
                    const { naturalWidth: l, naturalHeight: h } = e.currentTarget
                    if (l > 0 && h > 0) setRatio(l / h)
                  } : undefined}
                  className="block h-full w-full object-contain"
                />
              ) : (
                <p className="grid h-full place-items-center px-4 text-center text-sm text-fg-2">Cette page n’a pas pu être chargée. Elle reste dans le fichier à télécharger.</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {maj && pages.length > 0 && (
        <p
          aria-hidden className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-pilule border border-bord bg-surface-pop px-4 py-2 text-sm font-medium text-fg shadow-flottant"
          data-voile
        >
          {TEXTE_MISE_A_JOUR}
        </p>
      )}
    </div>
  )
}
