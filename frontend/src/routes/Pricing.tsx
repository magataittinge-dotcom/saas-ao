import { Link } from 'react-router-dom'
import GrilleOffres, { PHRASE_RESILIATION } from '@/components/offres/GrilleOffres'
import CoquillePublique, { NavSite } from '@/components/public/CoquillePublique'
import { Carte } from '@/components/ui/carte'
import { Page, TitreSection } from '@/components/ui/page'
import { classesBouton } from '@/components/ui/bouton'
import { ESSAI } from '@/lib/offres'

// Le détail que la grille ne dit pas (jury, tour 3 : la page répétait le bloc de l'accueil). Des faits du produit, tels que le
// code les applique (backend/services/quota.py : une unité par analyse et par mémoire, fenêtre mensuelle, blocage doux ;
// paiement par carte) ; la résiliation est la phrase du fondateur (D23), mot pour mot. Aucun prix ni aucun quota n'est écrit ici.
const DETAIL: readonly (readonly [string, string])[] = [
  ['Une analyse', 'Synorix reconnaît les pièces du dossier de l’acheteur, repère les lots et relève chaque exigence avec sa source.'],
  ['Un mémoire', 'Un mémoire technique rédigé pour un lot, à relire et à modifier, puis à exporter en Word et en PDF.'],
  ['Quota du mois atteint', 'Vos dossiers en cours restent ouverts. Les compteurs repartent de zéro chaque mois ; une offre plus large en redonne tout de suite.'],
  ['Paiement', 'Par carte bancaire, chaque mois.'],
  ['Résiliation', PHRASE_RESILIATION],
]

// La ligne des tarifs (elle ne change pas) : chaque engagement tient sur sa ligne, sans point médian orphelin au téléphone.
const ENGAGEMENTS = 'Sans engagement · Résiliable à tout moment · Support inclus'.split(' · ')

/**
 * Tarifs : la coquille du site (logo qui ramène au site, « Tarifs » marqué comme page courante dans l'en-tête, pied de page), la
 * grille telle que le code la donne (lib/offres.ts, components/offres/GrilleOffres.tsx), puis le détail : ce que compte une
 * analyse, un mémoire, ce qui se passe au quota atteint, le paiement, la résiliation. Aucun prix ni aucune offre n'est écrit ici.
 */
export default function Pricing() {
  return (
    <CoquillePublique nav={<NavSite tarifs="courant" />}>
      <Page titre="Tarifs" sousTitre="Trois offres, les mêmes fonctions : seuls les quotas mensuels changent."
        action={<Link to="/register" className={classesBouton('principal', 'max-md:w-full')}>Créer mon compte : {ESSAI.ao} appel d’offres offert</Link>}>
        <h2 className="sr-only">Les trois offres</h2>
        <GrilleOffres action={(offre) => (
          <Link to={`/register?plan=${offre.id}`} className={classesBouton('secondaire', 'w-full')}>Commencer avec {offre.nom}</Link>
        )} />
        <TitreSection id="detail">Le détail</TitreSection>
        <Carte sansMarge>
          <dl>
            {DETAIL.map(([terme, definition]) => (
              <div key={terme} className="grid gap-y-1 border-t border-bord py-4 first:border-t-0 md:grid-cols-3">
                {/* les mêmes colonnes que la grille : le terme sous Essentiel, la phrase à partir du bord de Pro */}
                <dt className="px-5 text-sm font-semibold text-fg sm:px-7">{terme}</dt>
                <dd className="max-w-[72ch] px-5 text-sm text-fg-2 sm:px-7 md:col-span-2">{definition}</dd>
              </div>
            ))}
          </dl>
          <ul aria-label="Nos engagements" className="flex flex-wrap gap-x-6 gap-y-1 border-t border-bord px-5 py-4 text-sm font-medium text-fg sm:px-7">
            {ENGAGEMENTS.map((e) => <li key={e} className="whitespace-nowrap">{e}</li>)}
          </ul>
        </Carte>
      </Page>
    </CoquillePublique>
  )
}
