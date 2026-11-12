import { Fragment, useState } from 'react'
import { Bouton } from '@/components/ui/bouton'
import { GroupeRadio } from '@/components/ui/case'
import { Dialogue } from '@/components/ui/dialogue'
import { Interrupteur } from '@/components/ui/interrupteur'
import { TexteMisEnForme } from '@/components/memoire/BlocsMemoire'
import { differences, motsChanges, sansBlancFinal, type Morceau } from '@/lib/differences'

export interface Trois {
  original: string
  propositions: string[]
  start: number
  end: number
}

/** Le passage d'origine et la proposition choisie, mot à mot : retiré barré, ajouté souligné (jamais la couleur seule). */
export function Differences({ morceaux }: { morceaux: readonly Morceau[] }) {
  return (
    <p className="whitespace-pre-wrap break-words font-memoire text-base text-fg" data-differences="">
      {morceaux.map((x, i) => {
        if (x.sorte === 'pareil') return <span key={i}>{x.texte}</span>
        const [mots, blanc] = sansBlancFinal(x.texte)
        return (
          <Fragment key={i}>
            {x.sorte === 'retire'
              ? <del className="rounded-sm bg-rouge-soft text-rouge-ink line-through"><span className="sr-only">Retiré : </span>{mots}</del>
              : <ins className="rounded-sm bg-vert-soft text-vert-ink underline"><span className="sr-only">Ajouté : </span>{mots}</ins>}
            {blanc}
          </Fragment>
        )
      })}
    </p>
  )
}

/** Le corps du dialogue (rendu seul dans les tests) : le choix entre les propositions, puis le texte ou ses différences. */
export function CorpsTrois({ trois, choix, onChoix, voirDifferences, onVoirDifferences }: {
  trois: Pick<Trois, 'original' | 'propositions'>
  choix: number
  onChoix: (i: number) => void
  voirDifferences: boolean
  onVoirDifferences: (v: boolean) => void
}) {
  const choisie = trois.propositions[choix] ?? trois.propositions[0] ?? ''
  const morceaux = differences(trois.original, choisie)
  return (
    <div className="grid max-h-[55vh] gap-x-6 gap-y-4 overflow-y-auto sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <GroupeRadio
        libelle="Propositions"
        valeur={String(choix)}
        onChange={(v) => onChoix(Number(v))}
        options={trois.propositions.map((p, i) => ({
          valeur: String(i),
          libelle: `Proposition ${i + 1}`,
          aide: `${motsChanges(differences(trois.original, p))} mots changés`,
        }))}
      />
      <div className="min-w-0 space-y-3 sm:border-l sm:border-bord sm:pl-6">
        <Interrupteur libelle="Voir les différences" coche={voirDifferences} onChange={onVoirDifferences} />
        {voirDifferences
          ? <Differences morceaux={morceaux} />
          : <p className="whitespace-pre-wrap break-words font-memoire text-base text-fg"><TexteMisEnForme texte={choisie} /></p>}
        <details className="text-sm text-fg-2">
          <summary className="cursor-pointer text-fg-2">Votre texte</summary>
          <p className="mt-2 whitespace-pre-wrap break-words font-memoire text-base text-fg-2"><TexteMisEnForme texte={trois.original} /></p>
        </details>
      </div>
    </div>
  )
}

/**
 * C2 — la réécriture en trois propositions (REECRIRE_TROIS, éteinte par défaut côté serveur) : l'utilisateur choisit
 * une proposition, voit ses différences avec son texte s'il le veut, et n'applique qu'à l'acceptation explicite.
 */
export default function TroisPropositions({ trois, plafond, onFermer, onAppliquer }: {
  trois: Trois | null
  plafond: number
  onFermer: () => void
  onAppliquer: (start: number, end: number, texte: string) => void
}) {
  const [choix, setChoix] = useState(0)
  const [voir, setVoir] = useState(false)
  const fermer = () => { setChoix(0); setVoir(false); onFermer() }
  return (
    <Dialogue
      ouvert={trois !== null}
      onOuvert={(o) => { if (!o) fermer() }}
      titre="Trois réécritures proposées"
      description={`Choisissez celle qui vous convient ; rien n’est changé tant que vous n’acceptez pas. Aucune unité n’est décomptée (${plafond} réécritures par jour au plus).`}
      taille="grand"
      actions={(
        <>
          <Bouton variante="secondaire" onClick={fermer}>Garder mon texte</Bouton>
          <Bouton variante="principal" onClick={() => { if (trois) onAppliquer(trois.start, trois.end, trois.propositions[choix] ?? trois.propositions[0]); fermer() }}>
            Accepter la proposition {choix + 1}
          </Bouton>
        </>
      )}
    >
      {trois && <CorpsTrois trois={trois} choix={choix} onChoix={setChoix} voirDifferences={voir} onVoirDifferences={setVoir} />}
    </Dialogue>
  )
}
