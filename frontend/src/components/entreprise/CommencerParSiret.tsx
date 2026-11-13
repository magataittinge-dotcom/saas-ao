import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bouton } from '@/components/ui/bouton'
import { Carte } from '@/components/ui/carte'
import { Champ } from '@/components/ui/champ'
import { authService } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'
import { useMouvementReduit } from '@/components/intelligence/useMouvementReduit'
import VisageAnime from './VisageAnime'

/** Ce que la page montrera une fois le SIRET reconnu : les trois rubriques, nommées comme elles le seront. */
const ENSUITE = [
  { titre: 'Identité', contenu: 'Raison sociale, dirigeant, contacts, activités.' },
  { titre: 'Moyens humains et matériels', contenu: 'Votre équipe, votre matériel, vos véhicules.' },
  { titre: 'Certifications et références', contenu: 'Vos qualifications et vos chantiers.' },
] as const

/**
 * Première action d'un profil vide : le SIRET, rien d'autre. Le répertoire Sirene remplit ensuite l'identité
 * (raison sociale, forme juridique, adresse, activité) ; la page complète revient d'elle-même.
 * Même validation que l'accueil du premier DCE : `/auth/sync`, un SIRET invalide ou déjà pris est expliqué, jamais bloquant.
 */
export default function CommencerParSiret({ onPasser }: { onPasser?: () => void }) {
  const setOrganization = useAuthStore((s) => s.setOrganization)
  const client = useQueryClient()
  const [siret, setSiret] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const mouvementReduit = useMouvementReduit()

  const valider = async () => {
    if (occupe) return
    if (!siret.trim()) {
      setMessage('Saisissez les 14 chiffres de votre SIRET.')
      champ.current?.focus()
      return
    }
    setOccupe(true)
    setMessage(null)
    try {
      const res = await authService.sync({ siret: siret.trim() })
      setOrganization(res.organization)
      const avertissement = (res as { siret_warning?: string }).siret_warning
      if (avertissement) setMessage(avertissement)
      client.invalidateQueries({ queryKey: ['memoire-config'] })
    } catch {
      setMessage('La vérification n’a pas abouti. Réessayez dans un instant, ou renseignez votre entreprise à la main.')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <section aria-labelledby="commencer-siret" className="grid items-center gap-x-10 gap-y-2 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Synorix s'adresse ici au client pour la première fois : son visage, à côté de ce qu'il demande (plus petit au téléphone,
          où le champ doit rester au-dessus du pli). */}
      <VisageAnime actif={!mouvementReduit} className="max-lg:h-[168px] max-lg:w-[120px]" />
      <div className="grid min-w-0 gap-8">
        <Carte className="max-w-xl">
          <h2 id="commencer-siret" className="text-lg font-semibold text-fg">Commencer par votre SIRET</h2>
          <p className="mt-1.5 text-pretty text-sm text-fg-2">
            Le répertoire Sirene remplit pour vous la raison sociale, la forme juridique, l’adresse et l’activité. Le reste se complète au fil de vos réponses.
          </p>
          {/* le champ garde ses 44 px en colonne (au téléphone) : il ne s'étire qu'en rangée */}
          <form className="mt-5 flex flex-col gap-2 sm:flex-row" noValidate onSubmit={(e) => { e.preventDefault(); void valider() }}>
            <Champ
              ref={champ}
              value={siret}
              onChange={(e) => { setSiret(e.target.value); setMessage(null) }}
              placeholder="14 chiffres"
              aria-label="Numéro SIRET"
              inputMode="numeric"
              autoComplete="off"
              className="chiffres shrink-0 placeholder:[font-variant-numeric:normal] sm:flex-1"
            />
            {/* jamais désactivé (un aplat délavé se lit mal) : sans numéro, il ramène au champ et dit quoi saisir */}
            <Bouton type="submit" variante="principal" enCours={occupe} libelleEnCours="Vérification…">Commencer</Bouton>
          </form>
          <p role="status" className="mt-3 text-sm text-ambre-ink empty:hidden">{message}</p>
          {onPasser && <Bouton variante="lien" className="mt-4 text-sm" onClick={onPasser}>Renseigner mon entreprise à la main</Bouton>}
        </Carte>
        {/* ce qui apparaîtra ici ensuite : dit, pas encore proposé (aucune action, aucun compteur) */}
        <div data-ensuite="" className="max-w-xl">
          <p className="text-sm font-medium text-fg">Ensuite, trois rubriques et leurs fiches à télécharger</p>
          <ul className="mt-2 divide-y divide-bord border-y border-bord text-sm">
            {ENSUITE.map((r) => (
              <li key={r.titre} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5">
                <span className="font-medium text-fg">{r.titre}</span>
                <span className="text-fg-2">{r.contenu}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
