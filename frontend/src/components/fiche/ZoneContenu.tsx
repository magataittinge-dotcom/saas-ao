// « Ce qu'il y a dans la fiche » : à quoi elle sert, ses sections avec « Prête » ou « À renseigner », et le lien qui ouvre
// le bon champ de Mon entreprise. Une surface, une rangée par section ; l'état se lit au mot et à l'icône, jamais à la
// couleur seule : vert pour « Prête », gris pour une section à renseigner (ce n'est pas une alerte : l'ambre est gardé pour
// ce qui est à surveiller). Puis les cases de dépôt de la rubrique (les mêmes que dans Mon entreprise) : ce qui est validé
// entre dans le profil, et l'aperçu se refait.
import { Link } from 'react-router-dom'
import CasesDepot from '@/components/entreprise/CasesDepot'
import { classesBouton } from '@/components/ui/bouton'
import { TitreSection } from '@/components/ui/page'
import { PastilleEtat } from '@/components/ui/pastille'
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
    <section aria-labelledby="zone-contenu" data-zone="contenu" className="min-w-0">
      <TitreSection id="zone-contenu">Ce qu'il y a dans la fiche</TitreSection>
      <div className="grid gap-6">
        <p className="max-w-prose text-sm text-fg-2" data-a-quoi-sert="">{A_QUOI_SERT[rubrique]}</p>
        <ul className="overflow-hidden rounded-lg border border-bord bg-surface-0" data-sections-fiche="">
          {lignes.map((l) => {
            const prete = l.etat === 'prete'
            return (
              <li key={l.cle} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 border-t border-bord px-4 py-2 first:border-t-0" data-section={l.cle} data-etat={l.etat}>
                {/* téléphone : le titre sur sa ligne, puis l'état à gauche et le lien à droite */}
                <span className="min-w-0 flex-1 basis-full text-sm font-medium text-fg sm:basis-48">
                  {l.numero && <span className="chiffres mr-2 text-fg-3" aria-hidden>{l.numero}</span>}{l.titre}
                </span>
                <PastilleEtat sens={prete ? 'vert' : 'gris'}>{LIBELLE_ETAT[l.etat]}</PastilleEtat>
                <Link to={l.lien} aria-label={`${prete ? 'Modifier' : 'Renseigner'} : ${l.titre}`} className={classesBouton('lien', 'ml-auto min-h-11 text-sm')}>
                  {prete ? 'Modifier' : 'Renseigner'}
                </Link>
              </li>
            )
          })}
        </ul>
        <CasesDepot rubrique={rubrique} apresValidation={apresValidation} disposition="colonne" />
      </div>
    </section>
  )
}
