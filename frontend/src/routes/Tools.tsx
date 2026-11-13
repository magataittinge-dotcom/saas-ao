import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sigle } from '@/components/common/Sigle'
import { api } from '@/services/api'
import { formatMontant } from '@/lib/utils'
import { Page, TitreSection } from '@/components/ui/page'
import { Bouton } from '@/components/ui/bouton'
import { ChampNombre, GroupeChamp } from '@/components/ui/champ'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { Message } from '@/components/ui/message'
import { Tableau, type ColonneTableau } from '@/components/ui/tableau'
import { BandeCases, CaseResume } from '@/components/ui/case-resume'

// ── Contrat du serveur (POST /api/calculators/retenue-garantie) ──────────────
// Le calculateur d'offre anormalement basse a été retiré (frontière chiffrage FERME, CLAUDE.md) : cet écran lit le contrat,
// il ne dit jamais rien d'un prix.
interface Poste {
  poste: string
  montant: number
  base: string
  detail: string
}
interface RetenueResult {
  montant_ttc: number
  postes: Poste[]
  avertissements: string[]
}

/** Ce qui n'a pas pu se faire, et le geste pour repartir : jamais le message brut du serveur. */
function phraseEchec(e: unknown): string {
  const status = (e as { response?: { status?: number } })?.response?.status
  if (status === 422) return 'Le calcul attend des valeurs positives : vérifiez le montant et les options.'
  return 'Le calcul n’a pas abouti : la connexion au serveur a échoué. Vos valeurs sont gardées, réessayez dans un instant.'
}

/** « 4,15 » (pour cent, tel qu'on le lit) → 0,0415 (ce que le calcul attend) ; vide = 0. */
export const tauxBceDecimal = (pourCent: number | null): number => (pourCent ? Math.round(pourCent * 1e6) / 1e8 : 0)

const TAUX_RETENUE = [
  { valeur: '0.05', libelle: '5 % (taux habituel)' },
  { valeur: '0.02', libelle: '2 % (PME / TPE)' },
  { valeur: '0', libelle: '0 % (non prévue)' },
] as const
const TAUX_TVA = [
  { valeur: '0.20', libelle: '20 %' },
  { valeur: '0.10', libelle: '10 %' },
  { valeur: '0.055', libelle: '5,5 %' },
  { valeur: '0', libelle: '0 %' },
] as const

const COLONNES: ColonneTableau<Poste>[] = [
  { cle: 'poste', titre: 'Poste', rendu: (p) => <span className="font-medium">{p.poste}</span> },
  { cle: 'montant', titre: 'Montant', nombre: true, tel: true, rendu: (p) => <span className="whitespace-nowrap font-semibold">{formatMontant(p.montant)}</span> },
  { cle: 'base', titre: 'Base', tel: true, rendu: (p) => <span className="text-fg-2">{p.base}</span> },
  { cle: 'detail', titre: 'Détail', tel: true, rendu: (p) => <span className="text-fg-2">{p.detail}</span> },
]

/**
 * Retenue de garantie : le montant du marché, deux taux, et le calcul. Les pénalités de retard et les intérêts moratoires
 * restent repliés (le taux de la BCE se saisit en pour cent). Le résultat : le montant TTC en tête, puis un tableau des postes, puis ce que le contrat permet. Rien n'est
 * enregistré.
 */
export default function Tools() {
  const [montantHt, setMontantHt] = useState<number | null>(null)
  const [tauxRg, setTauxRg] = useState('0.05')
  const [tva, setTva] = useState('0.20')
  const [options, setOptions] = useState(false)
  const [joursRetard, setJoursRetard] = useState<number | null>(null)
  const [diviseur, setDiviseur] = useState<number | null>(3000)
  // saisi en pour cent (4,15) ; le serveur le reçoit en décimal (0,0415), comme avant
  const [tauxBcePct, setTauxBcePct] = useState<number | null>(null)
  const [joursPaiement, setJoursPaiement] = useState<number | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [aSaisir, setASaisir] = useState(false)
  const [echec, setEchec] = useState<string | null>(null)
  const [resultat, setResultat] = useState<RetenueResult | null>(null)

  async function calculer() {
    if (montantHt === null || montantHt <= 0) {
      setASaisir(true)
      return
    }
    setASaisir(false)
    setEnCours(true)
    setEchec(null)
    try {
      const { data } = await api.post<RetenueResult>('/calculators/retenue-garantie', {
        montant_ht: montantHt,
        taux_rg: Number(tauxRg),
        tva: Number(tva),
        jours_retard_execution: joursRetard || 0,
        penalite_diviseur: diviseur || 3000,
        taux_bce: tauxBceDecimal(tauxBcePct),
        jours_retard_paiement: joursPaiement || 0,
      })
      setResultat(data)
    } catch (e) {
      setEchec(phraseEchec(e))
      setResultat(null)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Page
      titre="Retenue de garantie"
      sousTitre={<>Retenue, pénalités et intérêts moratoires, selon l’article 19 du <Sigle code="CCAG" /> Travaux. Rien n’est enregistré.</>}
      etroite
    >
      {/* Le formulaire est seul sur la page : il se pose sur le papier, sans carte autour ; sa largeur est celle d'une saisie. */}
      <form className="grid max-w-xl gap-5" noValidate onSubmit={(e) => { e.preventDefault(); void calculer() }}>
        {/* le champ du montant garde son identifiant : les scénarios de capture le visent */}
        <div className="grid content-start gap-1.5">
          <label htmlFor="rg-montant" className="text-xs font-medium text-fg-2">Montant du marché</label>
          <ChampNombre id="rg-montant" valeur={montantHt} onChange={(n) => { setMontantHt(n); setASaisir(false) }} unite="€ HT" min={0} milliers placeholder="250 000"
            aria-invalid={aSaisir || undefined} aria-describedby={aSaisir ? 'rg-montant-erreur' : undefined} />
          {aSaisir && <p id="rg-montant-erreur" role="alert" className="text-xs font-medium text-rouge-ink">Saisissez le montant du marché, hors taxes.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <GroupeChamp libelle="Taux de retenue">
            <ListeDeroulante valeur={tauxRg} onChange={setTauxRg} options={TAUX_RETENUE} />
          </GroupeChamp>
          <GroupeChamp libelle="TVA">
            <ListeDeroulante valeur={tva} onChange={setTva} options={TAUX_TVA} />
          </GroupeChamp>
        </div>

        <div>
          {/* un seul libellé, ouvert ou fermé : le chevron dit qu'il déplie */}
          <Bouton type="button" variante="lien" aria-expanded={options} aria-controls="rg-options" onClick={() => setOptions((o) => !o)}>
            Pénalités de retard et intérêts moratoires
            <ChevronDown aria-hidden className={cn('transition-transform duration-survol ease-survol motion-reduce:transition-none', options && 'rotate-180')} />
          </Bouton>
        </div>

        {options && (
          <div id="rg-options" className="grid gap-6 border-t border-bord pt-5">
            {/* deux calculs, chacun sur sa rangée : ce qui va ensemble se lit ensemble */}
            <fieldset className="grid min-w-0 gap-3 border-0 p-0">
              <legend className="mb-3 text-lg font-semibold text-fg">Pénalités de retard</legend>
              <p className="-mt-2 text-sm text-fg-2">Ce que le maître d’ouvrage retient si le chantier est livré en retard.</p>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <GroupeChamp libelle="Retard d’exécution">
                  <ChampNombre valeur={joursRetard} onChange={setJoursRetard} unite="jours" min={0} />
                </GroupeChamp>
                <GroupeChamp libelle="Pénalité par jour de retard" aide="Le montant du marché divisé par ce nombre : 3 000 dans les clauses générales des marchés de travaux.">
                  <ChampNombre valeur={diviseur} onChange={setDiviseur} min={1} milliers />
                </GroupeChamp>
              </div>
            </fieldset>
            <fieldset className="grid min-w-0 gap-3 border-0 p-0">
              <legend className="mb-3 text-lg font-semibold text-fg">Intérêts moratoires</legend>
              <p className="-mt-2 text-sm text-fg-2">Ce qui vous est dû si le maître d’ouvrage vous paie en retard.</p>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <GroupeChamp libelle="Retard de paiement">
                  <ChampNombre valeur={joursPaiement} onChange={setJoursPaiement} unite="jours" min={0} />
                </GroupeChamp>
                <GroupeChamp libelle="Taux de la BCE" aide="Le taux directeur en vigueur à la date du retard.">
                  <ChampNombre valeur={tauxBcePct} onChange={setTauxBcePct} unite="%" min={0} />
                </GroupeChamp>
              </div>
            </fieldset>
          </div>
        )}

        {/* le bouton ne bouge pas : un échec se dit dessous, là où le résultat était attendu */}
        <div>
          <Bouton type="submit" variante="principal" className="max-sm:w-full" enCours={enCours} libelleEnCours="Calcul…">Calculer</Bouton>
        </div>
        {echec && <Message ton="erreur">{echec}</Message>}
      </form>

      {/* La place du résultat est dessinée dès l'ouverture : ce que le calcul rendra, avec un tiret tant qu'il n'est pas fait. */}
      {!resultat && (
        <section aria-label="Résultat, avant le calcul" data-resultat-attendu="" className="mt-10 max-w-xl max-md:mt-[30px]">
          <TitreSection>Résultat</TitreSection>
          <dl className="divide-y divide-bord border-y border-bord text-sm">
            {['Montant TTC du marché', 'Retenue de garantie', 'Pénalités de retard', 'Intérêts moratoires'].map((ligne) => (
              <div key={ligne} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-fg-2">{ligne}</dt>
                <dd className="chiffres font-semibold text-fg-3" aria-label="Pas encore calculé">—</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {resultat && (
        <section aria-live="polite">
          <TitreSection>Résultat</TitreSection>
          <div className="grid gap-4">
            <BandeCases libelle="Montant du marché">
              <CaseResume etiquette="Montant TTC du marché" valeur={formatMontant(resultat.montant_ttc)} />
            </BandeCases>
            <Tableau libelle="Postes du calcul" colonnes={COLONNES} lignes={resultat.postes} cle={(p) => p.poste}
              vide={<p className="text-sm text-fg-2">Aucun poste à retenir pour ces valeurs.</p>} />
            {resultat.avertissements.map((a) => <Message key={a} ton="attention">{a}</Message>)}
            <Message ton="info">
              La retenue de garantie peut être remplacée, à votre initiative, par une caution personnelle et solidaire ou une garantie
              à première demande (article 19 du <Sigle code="CCAG" /> Travaux ; Code de la commande publique, art. R2191-36).
            </Message>
            <p className="text-xs text-fg-3">
              Calcul indicatif : l’assiette et les plafonds définitifs sont ceux du <Sigle code="CCAP" /> de votre marché.
            </p>
          </div>
        </section>
      )}
    </Page>
  )
}
