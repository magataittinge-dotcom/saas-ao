// « Ce qu'il y a dans la fiche » : à quoi elle sert, ses sections avec « Prête » ou « À renseigner », et le lien qui ouvre
// le bon champ de Mon entreprise. Une surface, une rangée par section ; l'état se lit au mot et à l'icône, jamais à la
// couleur seule : vert pour « Prête », gris pour une section à renseigner (ce n'est pas une alerte : l'ambre est gardé pour
// ce qui est à surveiller). Puis les lignes libres (du contenu ajouté à une section) et les cases de dépôt de la rubrique
// (les mêmes que dans Mon entreprise) : ce qui est validé
// entre dans le profil, et l'aperçu se refait.
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import CasesDepot from '@/components/entreprise/CasesDepot'
import { Bouton, BoutonIcone, classesBouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { TitreSection } from '@/components/ui/page'
import { PastilleEtat } from '@/components/ui/pastille'
import { A_QUOI_SERT, LIBELLE_ETAT, contenuDeLaFiche } from '@/lib/fichePage'
import { MAX_LIGNES_LIBRES, type FicheDonnees, type FicheSection, type LigneLibre, type RubriqueFiche } from '@/lib/fiche'

/**
 * Les lignes libres : une ligne de texte ajoutée à une section de la fiche (un engin, une précision). C'est du contenu :
 * elles se posent sous la liste des sections ; elles s'enregistrent avec le bordereau (la page) et l'aperçu se refait.
 * À l'ordinateur, une ligne tient sur une rangée (section, libellé, texte, retirer) ; au téléphone, elle s'empile.
 */
export function LignesLibres({ libres, sections, onChange }: {
  libres: LigneLibre[]
  sections: Pick<FicheSection, 'id' | 'titre'>[]
  onChange: (lignes: LigneLibre[]) => void
}) {
  const options = sections.map((s) => ({ valeur: s.id, libelle: `${s.id} ${s.titre}` }))
  const maj = (i: number, patch: Partial<LigneLibre>) => onChange(libres.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div className="grid gap-3" data-lignes-libres="">
      <div>
        <h3 className="text-base font-semibold text-fg">Lignes libres</h3>
        <p className="mt-1 text-sm text-fg-2">Ajoutez une ligne de texte dans une section de la fiche.</p>
      </div>
      {libres.map((l, i) => (
        <div key={i} className="grid items-center gap-2 rounded-lg border border-bord bg-surface-0 p-3 sm:grid-cols-[14rem_minmax(0,1fr)_minmax(0,2fr)_auto]" data-ligne-libre="">
          <ListeDeroulante libelle={`Section de la ligne libre ${i + 1}`} valeur={l.section} onChange={(section) => maj(i, { section })} options={options} />
          <Champ aria-label={`Libellé de la ligne libre ${i + 1}`} maxLength={80} placeholder="Libellé" value={l.libelle} onChange={(e) => maj(i, { libelle: e.target.value })} />
          <Champ aria-label={`Valeur de la ligne libre ${i + 1}`} maxLength={300} placeholder="Texte" value={l.valeur} onChange={(e) => maj(i, { valeur: e.target.value })} />
          <BoutonIcone libelle={`Retirer la ligne libre ${i + 1}`} className="max-sm:justify-self-end" onClick={() => onChange(libres.filter((_, j) => j !== i))}>
            <X aria-hidden strokeWidth={1.5} />
          </BoutonIcone>
        </div>
      ))}
      <Bouton
        variante="lien" className="justify-self-start text-sm" disabled={libres.length >= MAX_LIGNES_LIBRES || sections.length === 0}
        onClick={() => onChange([...libres, { section: sections[0]?.id ?? '01', libelle: '', valeur: '' }])}
      >
        <Plus aria-hidden />Ajouter une ligne
      </Bouton>
    </div>
  )
}

export default function ZoneContenu({ rubrique, donnees, libres, onLibres, apresValidation }: {
  rubrique: RubriqueFiche
  donnees: FicheDonnees
  libres: LigneLibre[]
  /** Une ligne libre ajoutée, modifiée ou retirée (la page l'enregistre avec le bordereau). */
  onLibres: (lignes: LigneLibre[]) => void
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
        <LignesLibres libres={libres} sections={donnees.sections.map(({ id, titre }) => ({ id, titre }))} onChange={onLibres} />
        <CasesDepot rubrique={rubrique} apresValidation={apresValidation} disposition="colonne" />
      </div>
    </section>
  )
}
