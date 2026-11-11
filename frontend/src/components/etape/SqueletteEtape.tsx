import { Squelette } from '@/components/ui/squelette'

/**
 * Le squelette d'une étape d'un AO, à la FORME du gabarit (jury, tour 1 : « un pavé gris puis quatre barres pleine largeur :
 * un fantôme générique qui ne ressemble à aucune étape ») : le titre à gauche et l'action à droite, la ligne d'utilité, la
 * bande de résumé (UNE surface, quatre cases séparées par des filets ; deux par deux au téléphone, comme la vraie), puis une
 * section (un titre, des lignes de longueurs de phrase, jamais 1 200 px). Fixe : rien ne pulse. Aucune valeur n'y est écrite :
 * ni « 0 », ni « Prêt », ni « Aucun » tant que rien n'est chargé.
 * À poser par une étape pendant le chargement de SES données : `<SqueletteEtape />` (avec son titre réel si elle le connaît :
 * elle rend alors son `GabaritEtape` et ne pose que `<SqueletteCorpsEtape />` dessous).
 */
export function SqueletteCorpsEtape({ cases = 4 }: { cases?: number }) {
  return (
    <div aria-hidden="true" data-squelette-corps="" className="space-y-8">
      <div className={`grid divide-bord rounded-carte border border-bord bg-surface-0 shadow-card max-md:grid-cols-2 md:divide-x ${cases >= 4 ? 'md:grid-cols-4' : cases === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {Array.from({ length: cases }, (_, i) => (
          <div key={i} className="grid min-h-[150px] content-start gap-3 p-5 max-md:min-h-[116px] max-md:p-4">
            <Squelette className="h-4 w-24 max-w-full" />
            <Squelette className="h-7 w-14" />
            <Squelette className="h-3.5 w-36 max-w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Squelette className="h-5 w-52 max-w-full" />
        <div className="flex flex-col gap-3">
          <Squelette className="h-3.5 w-[34rem] max-w-full" />
          <Squelette className="h-3.5 w-[28rem] max-w-[85%]" />
          <Squelette className="h-3.5 w-[31rem] max-w-[92%]" />
          <Squelette className="h-3.5 w-[18rem] max-w-[60%]" />
        </div>
      </div>
    </div>
  )
}

export function SqueletteEtape({ cases = 4 }: { cases?: number }) {
  return (
    <div aria-busy="true" data-squelette-etape="" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72 space-y-3">
          <Squelette className="h-10 w-72 max-w-full" />
          <Squelette className="h-4 w-[30rem] max-w-full" />
        </div>
        <Squelette className="h-11 w-52 rounded-pilule max-[768px]:hidden" />
      </div>
      <SqueletteCorpsEtape cases={cases} />
    </div>
  )
}

/**
 * Le squelette du fil des étapes : sept ronds répartis sur TOUTE la largeur, leur nom dessous, comme le vrai fil (ils étaient
 * serrés à gauche sur 290 px : tout glissait à l'arrivée des données).
 */
export function SqueletteFil() {
  return (
    <div aria-hidden="true" data-squelette-fil="" className="flex items-start justify-between gap-1 pb-6 max-sm:pb-10">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5">
          <Squelette className="size-8 shrink-0 rounded-pilule" />
          <Squelette className="h-3 w-16 max-md:hidden" />
        </div>
      ))}
    </div>
  )
}
