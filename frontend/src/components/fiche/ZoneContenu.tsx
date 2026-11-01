// Zone 1, « Ce qu'il y a dans la fiche » : à quoi elle sert, ses sections avec « Prête » ou « À renseigner », et le lien qui
// ouvre le bon champ de Mon entreprise. L'état se lit au mot et à l'icône, jamais à la couleur seule. Puis les cases de
// dépôt de la rubrique (les mêmes que dans Mon entreprise) : ce qui est validé entre dans le profil, et l'aperçu se refait.
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import CasesDepot from '@/components/entreprise/CasesDepot'
import { A_QUOI_SERT, LIBELLE_ETAT, contenuDeLaFiche } from '@/lib/fichePage'
import type { FicheDonnees, LigneLibre, RubriqueFiche } from '@/lib/fiche'

export default function ZoneContenu({ rubrique, donnees, libres, apresValidation }: {
  rubrique: RubriqueFiche
  donnees: FicheDonnees
  libres: LigneLibre[]
  /** Des propositions viennent d'entrer dans le profil : la page recharge les données de la fiche (l'aperçu suit). */
  apresValidation?: () => void
}) {
  const lignes = contenuDeLaFiche(rubrique, donnees, libres)
  return (
    <section aria-labelledby="zone-contenu" data-zone="contenu" className="min-w-0 space-y-4">
      <h2 id="zone-contenu" className="font-display text-h6 text-fg">Ce qu'il y a dans la fiche</h2>
      <p className="text-sm text-fg-2" data-a-quoi-sert>{A_QUOI_SERT[rubrique]}</p>
      <ul className="divide-y divide-bord-2 rounded-md border border-bord-2 bg-surface-0" data-sections-fiche>
        {lignes.map((l) => {
          const prete = l.etat === 'prete'
          return (
            <li key={l.cle} className="flex items-center gap-3 px-3 py-2.5" data-section={l.cle} data-etat={l.etat}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">
                  {l.numero && <span className="mr-2 text-fg-2" aria-hidden>{l.numero}</span>}{l.titre}
                </span>
                <span className={`mt-0.5 inline-flex items-center gap-1 text-xs font-medium ${prete ? 'text-success' : 'text-fg-2'}`}>
                  {prete ? <CheckCircle2 size={13} aria-hidden /> : <CircleDashed size={13} aria-hidden />}
                  {LIBELLE_ETAT[l.etat]}
                </span>
              </span>
              <Link
                to={l.lien} aria-label={`${prete ? 'Modifier' : 'Renseigner'} : ${l.titre}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-xs px-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline"
              >
                {prete ? 'Modifier' : 'Renseigner'}
              </Link>
            </li>
          )
        })}
      </ul>
      <CasesDepot rubrique={rubrique} apresValidation={apresValidation} disposition="colonne" />
    </section>
  )
}
