// Aperçu d'une fiche « Mon entreprise » : le VRAI document, page par page, en images.
//
// Le serveur fabrique le fichier (PDF, Word ou Excel) à partir des données et du bordereau ENREGISTRÉS, le convertit en
// PDF et en rend les pages en WebP (backend/services/fiches_rendu.py). Ce contrôleur, sans React ni DOM (donc testable
// avec des minuteries simulées), pilote la demande :
//   - une demande part 800 ms après le dernier changement (format, bordereau enregistré) : une rafale de saisies
//     ne fait qu'une demande, la dernière ;
//   - POST …/apercu répond 200 « pret » (cache), 202 « en_cours » (on sonde GET …/apercu/{empreinte} toutes les
//     700 ms jusqu'à « pret » ou « erreur ») ou 200 « indisponible » (LibreOffice indisponible : aperçu HTML simplifié) ;
//   - une réponse d'une demande dépassée est ignorée (la dernière gagne) ; ``arreter`` coupe tout au démontage.
// Pendant la mise à jour, les anciennes pages restent affichées (le composant les voile) : aucun saut de mise en page.
import type { RubriqueFiche } from '@/lib/fiche'

export type FormatFiche = 'pdf' | 'docx' | 'xlsx'
export type PhaseApercu = 'attente' | 'maj' | 'pret' | 'indisponible' | 'erreur'

export const DEBOUNCE_MS = 800
export const SONDAGE_MS = 700
export const SONDAGES_MAX = 400 // ~ 4 min : au-delà, on dit que l'aperçu tarde, sans sonder indéfiniment

export interface EtatApercu {
  phase: PhaseApercu
  empreinte: string | null
  pages: number
  message: string
  /** Les pages affichées sont celles de cette empreinte (vide tant qu'aucun aperçu n'a abouti). */
  empreinteAffichee: string | null
}

export const ETAT_INITIAL: EtatApercu = { phase: 'attente', empreinte: null, pages: 0, message: '', empreinteAffichee: null }

export interface ReponseDemande { etat: 'pret' | 'en_cours' | 'indisponible'; empreinte: string; pages?: number; message?: string }
export interface ReponseEtat { etat: 'en_cours' | 'pret' | 'erreur'; pages: number; message: string }

/** L'accès au serveur, injecté : axios en production, des doubles dans les tests. */
export interface AccesApercu {
  demander: (rubrique: RubriqueFiche, format: FormatFiche) => Promise<ReponseDemande>
  etat: (rubrique: RubriqueFiche, empreinte: string) => Promise<ReponseEtat>
}

export const MESSAGE_INDISPONIBLE = 'Aperçu simplifié : le rendu exact est indisponible pour le moment.'
export const MESSAGE_TARDE = "L’aperçu tarde à s’afficher. Le fichier reste téléchargeable."
export const MESSAGE_ECHEC = "L’aperçu n’a pas pu être produit pour le moment."

export class ControleurApercu {
  private etat: EtatApercu = ETAT_INITIAL
  private abonnes = new Set<(e: EtatApercu) => void>()
  private minuteur: ReturnType<typeof setTimeout> | null = null
  private sondage: ReturnType<typeof setTimeout> | null = null
  private jeton = 0
  private arrete = false

  constructor(private readonly acces: AccesApercu, private readonly rubrique: RubriqueFiche) {}

  lire(): EtatApercu { return this.etat }

  abonner(cb: (e: EtatApercu) => void): () => void {
    this.abonnes.add(cb)
    return () => { this.abonnes.delete(cb) }
  }

  /** Un changement (format, bordereau) : l'aperçu passe en « mise à jour » et la demande part après ``delai`` ms. */
  planifier(format: FormatFiche, delai: number = DEBOUNCE_MS): void {
    if (this.arrete) return
    this.jeton += 1
    this.annulerMinuteurs()
    this.publier({ ...this.etat, phase: 'attente', message: '' })
    const jeton = this.jeton
    this.minuteur = setTimeout(() => { this.minuteur = null; void this.lancer(format, jeton) }, delai)
  }

  /** Démontage de l'écran : plus aucune minuterie, plus aucune réponse prise en compte. */
  arreter(): void {
    this.arrete = true
    this.jeton += 1
    this.annulerMinuteurs()
    this.abonnes.clear()
  }

  /** Remontage de l'écran (React rejoue les effets au démarrage en développement : arrêt puis reprise aussitôt). */
  reprendre(): void {
    this.arrete = false
  }

  private annulerMinuteurs(): void {
    if (this.minuteur) clearTimeout(this.minuteur)
    if (this.sondage) clearTimeout(this.sondage)
    this.minuteur = this.sondage = null
  }

  private publier(e: EtatApercu): void {
    this.etat = e
    this.abonnes.forEach((cb) => cb(e))
  }

  private async lancer(format: FormatFiche, jeton: number): Promise<void> {
    this.publier({ ...this.etat, phase: 'maj', message: '' })
    try {
      const r = await this.acces.demander(this.rubrique, format)
      if (jeton !== this.jeton) return
      if (r.etat === 'indisponible') {
        this.publier({ ...this.etat, phase: 'indisponible', empreinte: null, message: r.message || MESSAGE_INDISPONIBLE })
      } else if (r.etat === 'pret') {
        this.publier({ phase: 'pret', empreinte: r.empreinte, pages: r.pages ?? 1, message: '', empreinteAffichee: r.empreinte })
      } else {
        this.publier({ ...this.etat, phase: 'maj', empreinte: r.empreinte })
        this.sonder(r.empreinte, jeton, 0)
      }
    } catch {
      if (jeton !== this.jeton) return
      this.publier({ ...this.etat, phase: 'erreur', message: MESSAGE_ECHEC })
    }
  }

  private sonder(empreinte: string, jeton: number, n: number): void {
    this.sondage = setTimeout(async () => {
      this.sondage = null
      if (jeton !== this.jeton) return
      try {
        const e = await this.acces.etat(this.rubrique, empreinte)
        if (jeton !== this.jeton) return
        if (e.etat === 'pret') {
          this.publier({ phase: 'pret', empreinte, pages: e.pages, message: '', empreinteAffichee: empreinte })
        } else if (e.etat === 'erreur') {
          this.publier({ ...this.etat, phase: 'erreur', message: e.message || MESSAGE_ECHEC })
        } else if (n + 1 >= SONDAGES_MAX) {
          this.publier({ ...this.etat, phase: 'erreur', message: MESSAGE_TARDE })
        } else {
          this.sonder(empreinte, jeton, n + 1)
        }
      } catch {
        if (jeton !== this.jeton) return
        this.publier({ ...this.etat, phase: 'erreur', message: MESSAGE_ECHEC })
      }
    }, SONDAGE_MS)
  }
}

/** « Mise à jour de l'aperçu… » : une demande est attendue ou en cours (les anciennes pages restent visibles, voilées). */
export const enMiseAJour = (e: EtatApercu): boolean => e.phase === 'attente' || e.phase === 'maj'

/** L'aperçu exact n'est pas disponible : l'écran montre l'aperçu HTML simplifié, avec sa ligne d'explication. */
export const apercuSimplifie = (e: EtatApercu): boolean => e.phase === 'indisponible' || e.phase === 'erreur'

/** Adresse (relative à l'API) de l'image d'une page, lue ensuite avec le jeton d'authentification. */
export const urlPage = (rubrique: RubriqueFiche, empreinte: string, numero: number): string =>
  `/entreprise/fiches/${rubrique}/apercu/${empreinte}/pages/${numero}`
