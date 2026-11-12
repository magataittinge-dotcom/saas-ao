import { Link } from 'react-router-dom'
import { ArrowDown, FileText, FolderOpen } from 'lucide-react'
import { PorteeSigles, Sigle } from '@/components/common/Sigle'
import GrilleOffres from '@/components/offres/GrilleOffres'
import CoquillePublique, { NavSite } from '@/components/public/CoquillePublique'
import { PARTAGE_DES_ROLES } from '@/components/onboarding/FilSeptEtapes'
import { classesBouton } from '@/components/ui/bouton'
import { Carte, RangeeCarte, TitreCarte } from '@/components/ui/carte'
import { TitreSection } from '@/components/ui/page'
import { PastilleEtat } from '@/components/ui/pastille'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { ESSAI } from '@/lib/offres'
import { FIL_ETAPES } from '@/lib/mesAO'
import { cn } from '@/lib/utils'

// Ce que fait chaque étape, dans l'ordre du fil de l'AO (lib/mesAO.ts). Des faits du produit, aucune promesse chiffrée.
const CE_QUE_FAIT_L_ETAPE: Record<(typeof FIL_ETAPES)[number], string> = {
  'Dépôt': 'Vous déposez le dossier de l’acheteur, en ZIP ou en PDF.',
  'Lots': 'Synorix reconnaît les lots ; vous choisissez ceux auxquels vous répondez.',
  'Décider': 'Les dates, les critères et les clauses du contrat, en clair. Vous décidez d’y aller ou non.',
  'Pièces': 'Les pièces que le règlement demande, et celles que votre coffre-fort contient déjà.',
  'Plan': 'Le plan du mémoire suit les critères de jugement de l’acheteur.',
  'Rédiger': 'Le mémoire s’écrit à partir de ce que Synorix sait de votre entreprise ; vous relisez et corrigez.',
  'Export': 'Le dossier est rangé dans l’ordre du règlement, prêt à déposer sur la plateforme de l’acheteur.',
}

// Exemples dessinés en code, données inventées : ce qu'on lit dans un contrat, ce qu'on range dans un dossier.
const EXIGENCES_ET_SOURCES = [['Mémoire daté et signé', 'règlement'], ['Visite du site avant la remise', 'règlement'], ['Attestation d’assurance décennale', 'contrat'], ['Planning détaillé des travaux', 'cahier technique']]
const CLAUSES_LUES = [['Délai de paiement', '30 jours'], ['Retenue de garantie', 'prévue au contrat'], ['Pénalités de retard', 'par jour de retard'], ['Avance', 'sur demande']]
const DOSSIER_RANGE = ['Lettre de candidature', 'Déclaration du candidat', 'Mémoire technique', 'Décomposition du prix']

// Une page publique : ses titres de section sont à 22 px (17 px, c'est le titre d'une carte de l'appli).
const TITRE = '[&>h2]:text-xl'
const COLONNE = 'flex min-w-0 flex-col border-bord p-5 max-lg:border-t max-lg:first:border-t-0 sm:p-6 lg:border-l lg:first:border-l-0'
const RANGEE = 'min-h-11 justify-between text-sm text-fg'

/**
 * Le site public : le même produit que l'appli (mêmes jetons, même logo, même serif au titre, clair et nuit, l'aurore
 * derrière). Un seul geste : créer son compte, avec l'offre telle que le code la donne (lib/offres.ts : ESSAI). Aucun
 * chiffre, témoignage ni logo client : le produit se montre par ce qu'il fait (les sept étapes, l'exigence et sa source, le
 * contrat lu en clair, le dossier rangé). La page ne lit pas Clerk : elle s'affiche même si le script tiers tarde (F-04).
 */
export default function Landing() {
  return (
    <PorteeSigles>
      <CoquillePublique nav={<NavSite />}>
        <section aria-labelledby="titre-site" className="grid items-start gap-x-12 gap-y-10 pb-6 pt-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pt-14">
          <div className="min-w-0">
            <h1 id="titre-site" className="titre-page text-fg">Du dossier de l’acheteur au dossier déposé.</h1>
            <p className="mt-4 max-w-[58ch] text-lg text-fg-2">
              Pour les entreprises du bâtiment qui répondent aux appels d’offres. Synorix lit le dossier, relève chaque exigence
              avec sa source et rédige votre mémoire technique.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/register" className={classesBouton('principal', 'max-sm:w-full')}>
                Créer mon compte : {ESSAI.ao} appel d’offres offert
              </Link>
              <a href="#comment" className={classesBouton('secondaire', 'max-sm:w-full')}>
                Voir comment ça marche<ArrowDown aria-hidden strokeWidth={1.75} />
              </a>
            </div>
            <SynorixParle className="mt-8">{PARTAGE_DES_ROLES}</SynorixParle>
          </div>

          <Carte role="img" aria-label="Exemple : une exigence relevée dans le règlement de la consultation, avec sa source" className="min-w-0 lg:mt-2">
            <p className="flex items-center gap-2 text-xs text-fg-2"><FileText aria-hidden size={15} strokeWidth={1.75} />Règlement de la consultation, exemple</p>
            <p className="mt-4 text-base text-fg-2">
              Le candidat remet un mémoire technique à l’appui de son offre.{' '}
              <mark className="rounded bg-surligneur-doux px-1 text-fg">Il y décrit les moyens humains affectés au chantier.</mark>{' '}
              Le mémoire est daté et signé.
            </p>
            <RangeeCarte className="mt-5 flex-wrap items-center gap-x-3 gap-y-2 pb-0 pt-4">
              <PastilleEtat sens="bleu" icone={null}>Exigence relevée</PastilleEtat>
              <p className="min-w-0 flex-1 basis-56 text-sm text-fg">Moyens humains affectés au chantier</p>
              <p className="basis-full text-xs text-fg-2">Source : règlement de la consultation, « Contenu de l’offre ». Un clic ouvre le passage surligné.</p>
            </RangeeCarte>
          </Carte>
        </section>

        <TitreSection id="comment" className={cn(TITRE, 'scroll-mt-6')}>Comment ça marche</TitreSection>
        {/* le fil des sept étapes, dessiné comme dans un AO : un rond numéroté par étape, un trait d'un rond au suivant
            (à l'horizontale sur un grand écran, à la verticale au téléphone) */}
        <ol aria-labelledby="comment" className="grid lg:grid-cols-7 lg:gap-x-4">
          {FIL_ETAPES.map((etape, i) => (
            <li key={etape} className="relative min-w-0 max-lg:grid max-lg:grid-cols-[2rem_minmax(0,1fr)] max-lg:gap-x-4 max-lg:pb-5 max-lg:last:pb-0">
              {i < FIL_ETAPES.length - 1 && <span aria-hidden className="absolute bg-bord-2 max-lg:bottom-1 max-lg:left-4 max-lg:top-9 max-lg:w-px lg:-right-2 lg:left-10 lg:top-4 lg:h-px" />}
              <span aria-hidden className="relative grid size-8 place-items-center rounded-pilule border border-bord-2 bg-surface-0 text-sm font-medium text-fg-2">{i + 1}</span>
              <div className="min-w-0 max-lg:pt-1 lg:mt-3 lg:pr-2">
                <p className="text-base font-semibold text-fg">{etape}</p>
                <p className="mt-1 text-sm text-fg-2">{CE_QUE_FAIT_L_ETAPE[etape]}</p>
              </div>
            </li>
          ))}
        </ol>

        <TitreSection id="apports" className={TITRE}>Ce que vous avez en main</TitreSection>
        {/* une seule surface, trois colonnes séparées par un filet : pas trois cartes jumelles */}
        <Carte sansMarge className="grid lg:grid-cols-3">
          <div className={COLONNE}>
            <TitreCarte>Chaque exigence garde sa source</TitreCarte>
            <p className="mt-1.5 text-base text-fg-2">Rien n’est affirmé sans le passage du dossier qui le dit : vous vérifiez d’un clic, dans le document de l’acheteur.</p>
            <ul aria-label="Exemple d’exigences relevées" className="mt-auto pt-4">
              {EXIGENCES_ET_SOURCES.map(([exigence, source]) => (
                <li key={exigence}><RangeeCarte className={RANGEE}>{exigence}<span className="shrink-0 text-xs text-fg-2">{source}</span></RangeeCarte></li>
              ))}
            </ul>
          </div>
          <div className={COLONNE}>
            <TitreCarte>Le contrat, lu en clair</TitreCarte>
            <p className="mt-1.5 text-base text-fg-2">Synorix relève les clauses du <Sigle code="CCAP" /> qui pèsent sur votre trésorerie. Il lit le contrat ; il ne commente jamais vos prix.</p>
            <ul aria-label="Exemple de clauses relevées" className="mt-auto pt-4">
              {CLAUSES_LUES.map(([clause, lu]) => (
                <li key={clause}><RangeeCarte className={RANGEE}>{clause}<span className="shrink-0 text-xs text-fg-2">{lu}</span></RangeeCarte></li>
              ))}
            </ul>
          </div>
          <div className={COLONNE}>
            <TitreCarte>Le dossier rangé dans l’ordre du règlement</TitreCarte>
            <p className="mt-1.5 text-base text-fg-2">Mémoire en Word et en PDF, pièces réunies, le tout dans l’ordre demandé par l’acheteur.</p>
            <ol aria-label="Exemple de dossier rangé" className="mt-auto pt-4">
              {DOSSIER_RANGE.map((piece, i) => (
                <li key={piece}><RangeeCarte className="min-h-11 text-sm text-fg"><FolderOpen aria-hidden size={16} strokeWidth={1.75} className="shrink-0 text-fg-3" /><span className="w-2.5 text-center text-fg-3">{i + 1}</span>{piece}</RangeeCarte></li>
              ))}
            </ol>
          </div>
        </Carte>

        <TitreSection id="tarifs" className={TITRE} action={<Link to="/pricing" className={classesBouton('lien')}>Voir les tarifs en détail</Link>}>Tarifs</TitreSection>
        <GrilleOffres action={(offre) => (
          <Link to={`/register?plan=${offre.id}`} className={classesBouton('secondaire', 'w-full')}>Commencer avec {offre.nom}</Link>
        )} />
      </CoquillePublique>
    </PorteeSigles>
  )
}
