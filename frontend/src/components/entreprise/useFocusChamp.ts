// /company?rubrique=<r>&champ=<id> : une fois la rubrique ouverte, le champ demandé défile en vue et prend le focus.
// Le champ est retrouvé par son intitulé (lib/entreprise/champsFiche.ts), sans identifiant dans les formulaires. Les
// champs « utiles et en option » sont repliés : le bouton qui les déplie est cliqué si le champ n'est pas encore là. La
// recherche réessaie quelques instants (le formulaire s'affiche après le chargement du profil), puis abandonne sans bruit.
import { useEffect } from 'react'
import { CHAMPS, intituleCorrespond, type CibleChamp } from '@/lib/entreprise/champsFiche'

const ESSAIS = 25
const PAUSE_MS = 120
const FOCALISABLE = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])'

/** L'élément à focaliser pour la cible, dans le panneau de la rubrique ; null s'il n'est pas (encore) affiché. */
export function trouverCible(panneau: ParentNode, cible: CibleChamp): HTMLElement | null {
  if (cible.label) {
    for (const etiquette of Array.from(panneau.querySelectorAll('label'))) {
      if (!intituleCorrespond(etiquette.textContent ?? '', cible, 'label')) continue
      const id = etiquette.getAttribute('for')
      const champ = id ? panneau.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`) : null
      if (champ) return champ
    }
  }
  if (cible.groupe) {
    for (const titre of Array.from(panneau.querySelectorAll('h3'))) {
      if (!intituleCorrespond(titre.textContent ?? '', cible, 'groupe')) continue
      const groupe = titre.closest('section')
      const premier = groupe?.querySelector<HTMLElement>(FOCALISABLE)
      return premier ?? (titre as HTMLElement)
    }
  }
  return null
}

function deplier(panneau: ParentNode): boolean {
  const bouton = Array.from(panneau.querySelectorAll<HTMLButtonElement>('button[aria-expanded="false"]'))
    .find((b) => /informations utiles/i.test(b.textContent ?? ''))
  bouton?.click()
  return !!bouton
}

export function useFocusChamp(champ: string | null, rubrique: string, pret: boolean, reduit: boolean): void {
  useEffect(() => {
    const cible = champ ? CHAMPS[champ] : undefined
    if (!champ || !cible || !pret || cible.rubrique !== rubrique) return
    let essai = 0
    let minuteur: ReturnType<typeof setTimeout>
    const chercher = () => {
      const panneau = document.querySelector('[role="tabpanel"]')
      const element = panneau ? trouverCible(panneau, cible) : null
      if (element) {
        element.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'center' })
        element.focus({ preventScroll: true })
        return
      }
      if (panneau && essai === 3) deplier(panneau)           // le champ est peut-être dans « les informations utiles »
      if (++essai < ESSAIS) minuteur = setTimeout(chercher, PAUSE_MS)
    }
    minuteur = setTimeout(chercher, 0)
    return () => clearTimeout(minuteur)
  }, [champ, rubrique, pret, reduit])
}
