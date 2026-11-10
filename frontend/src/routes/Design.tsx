import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Archive, Bell, Briefcase, Building2, Download, FileText, FolderOpen, Plus, Search, Settings, Trash2, Users } from 'lucide-react'
import { Page, TitreSection } from '@/components/ui/page'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'
import { Champ, ChampDate, ChampNombre, ChampRecherche, GroupeChamp, ZoneTexte } from '@/components/ui/champ'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { CaseACocher, GroupeRadio } from '@/components/ui/case'
import { Interrupteur } from '@/components/ui/interrupteur'
import { EffacerFiltres, PuceFiltre } from '@/components/ui/filtre'
import { Carte, RangeeCarte, TitreCarte } from '@/components/ui/carte'
import { PastilleCompte, PastilleEtat } from '@/components/ui/pastille'
import { BandeCases, CaseResume } from '@/components/ui/case-resume'
import { Tableau } from '@/components/ui/tableau'
import { Dialogue, DialogueConfirmation } from '@/components/ui/dialogue'
import { MenuElement, MenuPoints, MenuSeparateur } from '@/components/ui/menu'
import { Infobulle } from '@/components/ui/infobulle'
import { Message } from '@/components/ui/message'
import { annoncer } from '@/components/ui/toast'
import { Squelette, SqueletteLignes } from '@/components/ui/squelette'
import { EtatErreur, EtatVide } from '@/components/ui/etats'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { rapportContraste } from '@/lib/contraste'
import { cn } from '@/lib/utils'

// Page de référence interne (/design, non liée au menu) : tous les jetons et composants du système, en clair
// et en nuit côte à côte. Chaque exemple est rendu deux fois, dans une portée data-theme="light" et une portée
// data-theme="dark" : les valeurs affichées sont lues sur l'élément (getComputedStyle), pas recopiées.
// Les fenêtres, tiroirs et infobulles s'ouvrent dans le thème courant de l'application (bascule en haut à droite).

function Cote({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 min-[1100px]:grid-cols-2">
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} data-theme={theme} className="min-w-0 rounded-carte border border-bord-2 bg-surface-0 p-5 text-fg-2">
          <p className="mb-4 text-xs font-medium text-fg-3">{theme === 'light' ? 'Clair' : 'Nuit'}</p>
          {children}
        </div>
      ))}
    </div>
  )
}

function Section({ id, titre, note, children }: { id: string; titre: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-6 space-y-4 pt-10">
      <div>
        <h2 id={`${id}-t`} className="text-xl font-semibold text-fg">{titre}</h2>
        {note && <p className="mt-1 max-w-md text-sm text-fg-2">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** Valeur d'un jeton, lue sur l'élément dans sa portée de thème. */
function useJeton(jeton: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [valeur, setValeur] = useState('')
  useLayoutEffect(() => {
    if (ref.current) setValeur(getComputedStyle(ref.current).getPropertyValue(jeton).trim())
  }, [jeton])
  return { ref, valeur }
}

function Echantillon({ jeton, fond }: { jeton: string; fond?: string }) {
  const { ref, valeur } = useJeton(jeton)
  return (
    <div className="min-w-0">
      <div ref={ref} className="h-12 rounded-md border border-bord-2 [background:var(--echantillon)]" style={{ ['--echantillon' as string]: fond ?? `var(${jeton})` }} />
      <p className="mt-1.5 truncate text-xs font-medium text-fg">{jeton.replace(/^--/, '')}</p>
      <p className="truncate text-xs text-fg-3">{valeur}</p>
    </div>
  )
}

const PALETTES: [string, string[]][] = [
  ['Surfaces', ['--surface-page', '--surface-0', '--surface-1', '--surface-2', '--surface-dark', '--surface-pop']],
  ['Textes', ['--text-1', '--text-2', '--text-3', '--text-disabled']],
  ['Bordures', ['--border-1', '--border-2', '--border-field']],
  ['Accent (échelle)', ['--accent-50', '--accent-100', '--accent-200', '--accent-300', '--accent-400', '--accent-500', '--accent-600', '--accent-700', '--accent-800', '--accent-900']],
  ['Accent (rôles)', ['--accent-text', '--accent-ui', '--accent-ring', '--accent-fill', '--accent-tint', '--accent-tint-2']],
  ['Bleu : en cours, action, information', ['--bleu-soft', '--bleu-mark', '--bleu-ink']],
  ['Vert : fait, prêt, gagné', ['--vert-soft', '--vert-mark', '--vert-ink']],
  ['Ambre : à surveiller', ['--ambre-soft', '--ambre-mark', '--ambre-ink']],
  ['Rouge : urgent ou négatif', ['--rouge-soft', '--rouge-mark', '--rouge-ink']],
  ['Turquoise : veille', ['--turquoise-soft', '--turquoise-mark', '--turquoise-ink']],
  ['Gris : à venir, sans suite', ['--gris-soft', '--gris-mark', '--gris-ink']],
  ['Surlignage de la preuve', ['--highlight', '--highlight-soft']],
  ['Aurore (marque, jamais un état)', ['--aurore-ink', '--aurore-mark', '--aurore-glow', '--aurore-a', '--aurore-b', '--aurore-c']],
  ['Flamme (signature rare) et filet de lumière', ['--flamme', '--flamme-glow', '--filet-lumiere', '--accent-vif']],
]

const PAIRES: [string, string, string][] = [
  ['Texte principal', '--text-1', '--surface-0'],
  ['Texte secondaire', '--text-2', '--surface-1'],
  ['Texte discret', '--text-3', '--surface-2'],
  ['Lien et accent', '--accent-text', '--surface-0'],
  ['Texte du bouton plein', '--on-accent', '--accent-600'],
  ['Bleu sur le papier', '--bleu-ink', '--surface-0'],
  ['Vert sur le papier', '--vert-ink', '--surface-0'],
  ['Ambre sur le papier', '--ambre-ink', '--surface-0'],
  ['Rouge sur le papier', '--rouge-ink', '--surface-0'],
  ['Bord des champs (interface, 3:1)', '--border-field', '--surface-0'],
  ['Anneau de focus (interface, 3:1)', '--accent-ring', '--surface-1'],
]

function TableContrastes() {
  const ref = useRef<HTMLDivElement>(null)
  const [lignes, setLignes] = useState<{ nom: string; r: number | null; seuil: number }[]>([])
  useLayoutEffect(() => {
    if (!ref.current) return
    const s = getComputedStyle(ref.current)
    setLignes(PAIRES.map(([nom, a, b]) => ({ nom, r: rapportContraste(s.getPropertyValue(a), s.getPropertyValue(b)), seuil: /interface/.test(nom) ? 3 : 4.5 })))
  }, [])
  return (
    <div ref={ref}>
      <Tableau libelle="Contrastes" lignes={lignes} cle={(l) => l.nom} vide={null}
        colonnes={[
          { cle: 'nom', titre: 'Paire', rendu: (l) => l.nom },
          { cle: 'rapport', titre: 'Rapport', nombre: true, tel: true, rendu: (l) => (l.r === null ? '—' : l.r.toFixed(2)) },
          { cle: 'seuil', titre: 'Seuil', tel: true, rendu: (l) => <PastilleEtat sens={l.r !== null && l.r >= l.seuil ? 'vert' : 'ambre'}>{l.seuil}:1{l.r !== null && l.r >= l.seuil ? ' tenu' : ''}</PastilleEtat> },
        ]} />
    </div>
  )
}

const TAILLES: [string, string, string][] = [
  ['11', 'text-micro', 'Libellés de la barre latérale (plancher)'],
  ['12,5', 'text-xs', 'Libellés, pastilles, en-têtes de colonne, aide d’un champ'],
  ['13,5', 'text-sm', 'Méta, contrôles, boutons, rangées'],
  ['15', 'text-base', 'Corps du texte d’interface'],
  ['17', 'text-lg', 'Titre de carte ou de section (600)'],
  ['22', 'text-xl', 'Titre d’un bloc d’écran (600)'],
]

function Mouvement() {
  const [va, setVa] = useState(false)
  const durees: [string, string, string][] = [
    ['100 ms', 'duration-fast', 'Couleur au survol, appui, fondu d’un écran, fermetures'],
    ['180 ms', 'duration-survol', 'Contrôles, menus, listes'],
    ['280 ms', 'duration-pop', 'Dialogues, panneaux, feuilles du bas'],
  ]
  return (
    <div className="space-y-3">
      <Bouton onClick={() => setVa((v) => !v)}>Rejouer</Bouton>
      {durees.map(([nom, classe, texte]) => (
        <div key={nom} className="flex items-center gap-3">
          <div className="relative h-8 w-40 shrink-0 overflow-hidden rounded-pilule bg-surface-1">
            <span className={cn('absolute left-1 top-1 size-6 rounded-pilule bg-accent-ui transition-transform ease-survol', classe, va && 'translate-x-[124px]')} />
          </div>
          <p className="text-sm text-fg-2"><span className="chiffres font-semibold text-fg">{nom}</span> · {texte}</p>
        </div>
      ))}
      <p className="max-w-md text-sm text-fg-2">Une seule courbe (sortie douce, sans dépassement). Au survol le fond change et rien ne bouge ; à l’appui tout ce qui se clique se réduit à 0,98 en 100 ms. Rien ne boucle, sauf l’aurore et le visage. « Réduire les animations » rend tout instantané.</p>
    </div>
  )
}

const TRIS = [{ valeur: 'remise', libelle: 'Remise la plus proche' }, { valeur: 'recent', libelle: 'Ajout le plus récent' }, { valeur: 'nom', libelle: 'Nom, de A à Z' }]
type Piece = { id: string; nom: string; etat: 'prete' | 'ajoindre'; maj: string; pages: number }
const PIECES: Piece[] = [
  { id: 'a', nom: 'Attestation de régularité fiscale', etat: 'prete', maj: '12/10/2026', pages: 2 },
  { id: 'b', nom: 'Attestation d’assurance décennale', etat: 'ajoindre', maj: '—', pages: 0 },
  { id: 'c', nom: 'Extrait Kbis', etat: 'prete', maj: '03/09/2026', pages: 1 },
]

function Formulaire() {
  const [tri, setTri] = useState('remise')
  const [date, setDate] = useState<string | null>('2026-12-04')
  const [taux, setTaux] = useState<number | null>(5)
  const [coche, setCoche] = useState(true)
  const [resultat, setResultat] = useState<'gagne' | 'perdu'>('gagne')
  const [anime, setAnime] = useState(true)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <GroupeChamp libelle="Raison sociale" aide="Telle qu’elle figure sur votre Kbis."><Champ placeholder="Nom de l’entreprise" /></GroupeChamp>
      <GroupeChamp libelle="SIRET" erreur="Le SIRET compte 14 chiffres : il en manque 2."><Champ defaultValue="123 456 789 000" /></GroupeChamp>
      <GroupeChamp libelle="Référence" facultatif><Champ disabled defaultValue="Renseignée par Synorix" /></GroupeChamp>
      <GroupeChamp libelle="Trier par"><ListeDeroulante valeur={tri} onChange={setTri} options={TRIS} /></GroupeChamp>
      <GroupeChamp libelle="Date de remise" aide="jj/mm/aaaa"><ChampDate valeur={date} onChange={setDate} /></GroupeChamp>
      <GroupeChamp libelle="Taux de la retenue"><ChampNombre valeur={taux} onChange={setTaux} unite="%" min={0} max={100} /></GroupeChamp>
      <GroupeChamp libelle="Moyens techniques" className="sm:col-span-2"><ZoneTexte placeholder="Matériel, effectifs, certifications…" /></GroupeChamp>
      <div className="sm:col-span-2"><ChampRecherche placeholder="Rechercher un appel d’offres" aria-label="Rechercher un appel d’offres" /></div>
      <div className="grid gap-1">
        <CaseACocher libelle="Mettre à jour mon profil" coche={coche} onChange={setCoche} />
        <CaseACocher libelle="Case désactivée" coche={false} onChange={() => {}} disabled />
        <Interrupteur libelle="Animer le fond" coche={anime} onChange={setAnime} />
      </div>
      <GroupeRadio libelle="Résultat" valeur={resultat} onChange={setResultat} options={[{ valeur: 'gagne', libelle: 'Gagné' }, { valeur: 'perdu', libelle: 'Perdu', aide: 'L’AO passe dans les terminés.' }]} />
    </div>
  )
}

function Filtres() {
  const [metier, setMetier] = useState<string | null>('Gros œuvre')
  const [zone, setZone] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PuceFiltre libelle="Métier" valeur={metier} onOuvrir={() => setMetier('Gros œuvre')} onRetirer={() => setMetier(null)} />
      <PuceFiltre libelle="Zone" valeur={zone} onOuvrir={() => setZone('50 km')} onRetirer={() => setZone(null)} />
      <PuceFiltre libelle="Date limite" onOuvrir={() => {}} />
      <EffacerFiltres actifs={(metier ? 1 : 0) + (zone ? 1 : 0)} onEffacer={() => { setMetier(null); setZone(null) }} />
    </div>
  )
}

function Surcouches() {
  const [dialogue, setDialogue] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Infobulle texte="Dossier de consultation des entreprises"><Bouton>Infobulle</Bouton></Infobulle>
      <Bouton onClick={() => setDialogue(true)}>Dialogue</Bouton>
      <Bouton onClick={() => setConfirmation(true)}>Confirmation</Bouton>
      <MenuPoints libelle="Autres actions">
        <MenuElement><Download aria-hidden size={18} strokeWidth={1.5} />Télécharger</MenuElement>
        <MenuElement>Renommer</MenuElement>
        <MenuSeparateur />
        <MenuElement danger><Trash2 aria-hidden size={18} strokeWidth={1.5} />Supprimer</MenuElement>
      </MenuPoints>
      <Sheet>
        <SheetTrigger asChild><Bouton>Tiroir</Bouton></SheetTrigger>
        <SheetContent side="right"><SheetHeader><SheetTitle>Voir dans le dossier</SheetTitle><SheetDescription>Le passage cité est surligné dans la pièce.</SheetDescription></SheetHeader></SheetContent>
      </Sheet>
      <Sheet>
        <SheetTrigger asChild><Bouton>Feuille du bas</Bouton></SheetTrigger>
        <SheetContent side="bottom"><SheetHeader><SheetTitle>Mon compte</SheetTitle><SheetDescription>Au téléphone, les menus longs s’ouvrent par le bas.</SheetDescription></SheetHeader></SheetContent>
      </Sheet>
      <Bouton onClick={() => annoncer('Le dossier est enregistré.', 'succes')}>Toast</Bouton>
      <Bouton onClick={() => annoncer('L’enregistrement n’a pas abouti. Réessayez.', 'erreur')}>Toast d’erreur</Bouton>
      <Dialogue ouvert={dialogue} onOuvert={setDialogue} titre="Ranger le document" description="Choisissez la rubrique du coffre-fort où ce document sera rangé."
        actions={<><Bouton onClick={() => setDialogue(false)}>Annuler</Bouton><Bouton onClick={() => setDialogue(false)}>Ranger</Bouton></>}>
        <GroupeChamp libelle="Rubrique"><ListeDeroulante valeur="assurances" onChange={() => {}} options={[{ valeur: 'assurances', libelle: 'Assurances' }, { valeur: 'fiscal', libelle: 'Attestations fiscales' }]} /></GroupeChamp>
      </Dialogue>
      <DialogueConfirmation ouvert={confirmation} onOuvert={setConfirmation} danger titre="Supprimer cet appel d’offres ?" description="Le dossier et ses pièces seront retirés de votre compte."
        libelleConfirmer="Supprimer" onConfirmer={() => setConfirmation(false)} />
    </div>
  )
}

const SECTIONS = ['grille', 'couleurs', 'contrastes', 'typographie', 'formes', 'boutons', 'champs', 'filtres', 'cartes', 'resume', 'tableau', 'pastilles', 'onglets', 'surcouches', 'messages', 'etats', 'visage', 'mouvement', 'icones']

export default function Design() {
  return (
    <Page titre="Système de design" sousTitre="Page interne, non liée au menu : les jetons et chaque composant du système, dans chaque état, en clair et en nuit.">
      <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1">
        {SECTIONS.map((id) => (
          <a key={id} href={`#${id}`} className="flex min-h-11 items-center rounded text-sm font-medium text-fg underline decoration-bord-2 underline-offset-4 hover:decoration-fg">{id}</a>
        ))}
      </nav>

      <Section id="grille" titre="Grille" note="Un seul conteneur (1 200 px, gouttière 16 / 24 / 32), posé par la coquille autour de l’écran et dans la barre du haut : un seul bord gauche. Une route rend <Page> ; elle ne pose ni largeur ni marge latérale. Le petit titre de la barre n’apparaît que lorsque le h1 est sorti de l’écran : faites défiler cette page.">
        <Carte>
          <TitreSection>Titre de section</TitreSection>
          <p className="text-sm text-fg-2">Trois fois plus d’air au-dessus d’un titre de section qu’en dessous : 40 / 16 px (30 / 12 au téléphone). Douze pixels entre deux surfaces sœurs.</p>
        </Carte>
      </Section>

      <Section id="couleurs" titre="Couleurs" note="Toutes les teintes de la marque sont mesurées sur le visage : neutres et nuit à la teinte de ses ombres (237°), une seule couleur d’action à la teinte de son verre (252°), la flamme (79°) en signature rare ; l’accent d’aurore signe la marque et n’est jamais un état. Six sens d’état, chacun avec un mot et une icône. En nuit, la seule lumière colorée est l’aurore : aucune lueur sous le bouton principal ; les filets d’un pixel sont la lumière du visage en transparence, le bord des champs reste opaque à 3:1.">
        <Cote>
          <div className="space-y-5">
            {PALETTES.map(([nom, jetons]) => (
              <div key={nom}>
                <h3 className="mb-2 text-sm font-medium text-fg">{nom}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
                  {jetons.map((j) => <Echantillon key={j} jeton={j} />)}
                </div>
              </div>
            ))}
          </div>
        </Cote>
      </Section>

      <Section id="contrastes" titre="Contrastes" note="Rapports lus à l’écran sur les valeurs calculées ; tests/contraste-palette.test.ts garde la matrice complète (texte 4,5:1, interface 3:1).">
        <Cote><TableContrastes /></Cote>
      </Section>

      <Section id="typographie" titre="Typographie" note="Newsreader pour le h1 de la page et le texte du mémoire, et rien d’autre ; Manrope pour tout le reste, chiffres tabulaires. Trois graisses (400, 500, 600), sept tailles, aucune capitale forcée, aucune police à chasse fixe. Approche : −0,03 em sur le gros chiffre, −0,01 em sur les titres de 17 et 22 px, 0 en dessous.">
        <Cote>
          <div className="space-y-4">
            <p className="titre-page text-fg">Mes appels d’offres</p>
            {TAILLES.map(([px, classe, usage]) => (
              <div key={px} className="flex items-baseline gap-3">
                <span className="chiffres w-10 shrink-0 text-xs text-fg-3">{px}</span>
                <p className={cn('min-w-0 text-fg', classe, (px === '17' || px === '22') && 'font-semibold')}>{usage}</p>
              </div>
            ))}
            <p className="lecteur-memoire max-w-[72ch] text-lg leading-[1.65] text-fg">
              Texte du mémoire, Newsreader 17 / 1,65. Le groupe scolaire reste en activité pendant les travaux : notre organisation protège les usagers avant de chercher la cadence.
            </p>
            <div className="flex flex-wrap gap-6 text-base text-fg"><span className="font-normal">400 · texte</span><span className="font-medium">500 · libellés, contrôles</span><span className="font-semibold">600 · titres, chiffres</span></div>
          </div>
        </Cote>
      </Section>

      <Section id="formes" titre="Rayons et ombres" note="Quatre rayons : 8 (petits éléments), 14 (contrôles), 22 (surfaces), pilule (action principale, recherche, filtres, pastilles) ; 4 px sous 24 px de haut. Un enfant n’a jamais un rayon supérieur à celui de son parent. Des traits d’un pixel plutôt que des ombres : seuls les flottants portent une ombre, à la teinte des ombres du visage. En nuit, un filet de lumière en haut de chaque surface.">
        <Cote>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              {[['4', 'rounded'], ['8', 'rounded-md'], ['14', 'rounded-lg'], ['22', 'rounded-carte'], ['pilule', 'rounded-pilule']].map(([nom, classe]) => (
                <div key={nom} className="text-center"><div className={cn('size-16 border border-bord-2 bg-surface-1', classe)} /><p className="chiffres mt-1 text-xs text-fg-3">{nom}</p></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[['carte', 'shadow-card border border-bord'], ['flottant', 'shadow-flottant border border-bord'], ['toast', 'shadow-toast border border-bord'], ['action', 'shadow-cta border border-bord']].map(([nom, classe]) => (
                <div key={nom} className={cn('grid h-16 place-items-center rounded-lg bg-surface-0 text-xs text-fg-2', classe)}>{nom}</div>
              ))}
            </div>
          </div>
        </Cote>
      </Section>

      <Section id="boutons" titre="Boutons" note="Un seul bouton principal (pilule, aplat d’accent) par écran : dès qu’il est monté, « Nouvel appel d’offres » de la barre passe au trait (il y en a un ici : regardez la barre). Survol : le fond change, rien ne bouge. Appui : 0,98 en 100 ms. Focus : contour de 2 px (Tab). Désactivé : 45 %. En cours : le libellé change et le bouton se désactive, sans roue qui tourne. 44 px partout.">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Bouton variante="principal"><Download aria-hidden />Télécharger le dossier</Bouton>
          <span className="text-sm text-fg-2">Le seul aplat d’accent de cet écran.</span>
        </div>
        <Cote>
          <div className="grid gap-4">
            {([['Repos', {}], ['Désactivé', { disabled: true }], ['En cours', { enCours: true, libelleEnCours: 'Enregistrement…' }]] as const).map(([etat, props]) => (
              <div key={etat} className="flex flex-wrap items-center gap-3">
                <span className="w-20 shrink-0 text-xs font-medium text-fg-3">{etat}</span>
                <Bouton {...props}>Secondaire</Bouton>
                <Bouton variante="discret" {...props}>Discret</Bouton>
                <Bouton variante="danger" {...props}><Trash2 aria-hidden />Supprimer</Bouton>
                <Bouton variante="lien" {...props}>Lien</Bouton>
                <BoutonIcone libelle="Ajouter" disabled={'disabled' in props || 'enCours' in props}><Plus aria-hidden strokeWidth={1.5} /></BoutonIcone>
              </div>
            ))}
            <p className="max-w-md text-sm text-fg-2">Survol, appui et focus : passez la souris, appuyez, tabulez. Le bouton principal suit les mêmes états : désactivé à 45 %, en cours avec son libellé qui change. Il n’est montré qu’une fois, au-dessus, pour ne pas poser un second aplat à l’écran.</p>
          </div>
        </Cote>
      </Section>

      <Section id="champs" titre="Champs, liste déroulante, date, nombre, cases" note="Une forme par rôle : saisie et liste déroulante = rectangle de 14 px, 44 px de haut, trait à 3:1 ; recherche = pilule. États : repos, survol (trait plus marqué), focus (trait et contour d’accent), erreur (le message nomme la correction), désactivé. Aucun contrôle natif visible : la liste, la date et le nombre sont dessinés.">
        <Cote><Formulaire /></Cote>
      </Section>

      <Section id="filtres" titre="Filtres" note="Une puce à deux états : proposée (« + Métier ») ou active (elle porte sa valeur et sa croix). Une sélection n’est jamais un aplat : fond bleu doux, texte bleu, trait bleu. « Effacer les filtres » n’apparaît que si un filtre est actif.">
        <Cote><Filtres /></Cote>
      </Section>

      <Section id="cartes" titre="Cartes" note="Papier, trait d’un pixel, rayon 22. Plate au repos : au survol d’une carte cliquable, seul le trait fonce. Jamais de carte dans une carte : des rangées séparées par un filet.">
        <Cote>
          <div className="grid gap-3 sm:grid-cols-2">
            <Carte>
              <TitreCarte>Réhabilitation d’une salle des fêtes</TitreCarte>
              <p className="mt-1 text-sm text-fg-2">Commune de démonstration</p>
              <div className="mt-3">
                <RangeeCarte><span className="flex-1 text-sm">Remise des offres</span><span className="chiffres text-sm text-fg-2">12/11/2026</span></RangeeCarte>
                <RangeeCarte><span className="flex-1 text-sm">Pièces</span><PastilleEtat sens="vert">9 sur 9 prêtes</PastilleEtat></RangeeCarte>
              </div>
            </Carte>
            <Carte cliquable tabIndex={0}>
              <TitreCarte>Carte cliquable</TitreCarte>
              <p className="mt-1 text-sm text-fg-2">Survol : le trait fonce. Appui : le fond passe à la glace. Focus : contour de 2 px.</p>
            </Carte>
          </div>
        </Cote>
      </Section>

      <Section id="resume" titre="Cases de résumé" note="Une seule surface découpée par des filets. L’étiquette en haut, la valeur dessous. Un nombre supérieur à 0 : le gros chiffre, seul. Rien à compter : « Aucune » ou « Aucun », jamais un gros 0, jamais l’étiquette répétée. L’unité seulement si elle ajoute un sens.">
        <Cote>
          <BandeCases>
            <CaseResume etiquette="En cours" valeur={3} />
            <CaseResume etiquette="Remises sous 7 jours" valeur={0} rien="Aucune" />
            <CaseResume etiquette="Questions à l’acheteur" valeur={2} unite="à poser" etat={<PastilleEtat sens="ambre">À vérifier</PastilleEtat>} />
            <CaseResume etiquette="Prochaine remise" valeur="ven. 4 déc., 12 h" precision="Salle des fêtes, lot 2" />
          </BandeCases>
        </Cote>
      </Section>

      <Section id="tableau" titre="Tableau" note="Une surface à filets horizontaux : aucun trait vertical, aucune zébrure. Texte à gauche, nombres et dates à droite en chiffres tabulaires. Rangées de 52 px, cliquables entières. Aucune ligne : pas de tableau, l’état vide. Au-delà de 50 lignes : des pages de 50 (« 1–50 sur 312 »). Au téléphone, chaque rangée s’empile.">
        <Cote>
          <Tableau libelle="Pièces" lignes={PIECES} cle={(p) => p.id} onLigne={() => {}} vide={null}
            colonnes={[
              { cle: 'nom', titre: 'Pièce', rendu: (p) => <span className="font-medium">{p.nom}</span> },
              { cle: 'etat', titre: 'État', tel: true, rendu: (p) => (p.etat === 'prete' ? <PastilleEtat sens="vert">Prête</PastilleEtat> : <PastilleEtat sens="ambre">À joindre</PastilleEtat>) },
              { cle: 'maj', titre: 'Mise à jour', nombre: true, rendu: (p) => p.maj },
              { cle: 'pages', titre: 'Pages', nombre: true, rendu: (p) => (p.pages > 0 ? p.pages : '—') },
            ]} />
        </Cote>
      </Section>

      <Section id="pastilles" titre="Pastilles d’état" note="Un sens, un mot, une icône : jamais la couleur seule. Bleu en cours, vert fait, ambre à surveiller, rouge urgent ou négatif, turquoise veille, gris à venir. Dans un bloc, la plus urgente gagne.">
        <Cote>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <PastilleEtat sens="bleu">En cours</PastilleEtat><PastilleEtat sens="vert">Prêt</PastilleEtat><PastilleEtat sens="ambre">À mettre à jour</PastilleEtat>
              <PastilleEtat sens="rouge">Remise dans 2 jours</PastilleEtat><PastilleEtat sens="turquoise">Trouvé par la veille</PastilleEtat><PastilleEtat sens="gris">Sans suite</PastilleEtat>
            </div>
            <div className="flex items-center gap-6">
              <span className="relative grid size-11 place-items-center rounded-pilule bg-surface-1 text-fg-2"><FolderOpen size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden /><span className="absolute -right-0.5 -top-0.5"><PastilleCompte valeur={3} sens="rouge" /></span></span>
              <span className="relative grid size-11 place-items-center rounded-pilule bg-surface-1 text-fg-2"><Bell size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden /><span className="absolute right-1 top-1"><PastilleCompte sens="ambre" /></span></span>
              <span className="text-sm text-fg-2">Sur une icône : un compteur ou un point.</span>
            </div>
          </div>
        </Cote>
      </Section>

      <Section id="onglets" titre="Onglets" note="Flèches gauche et droite, Origine et Fin au clavier (Radix). L’onglet choisi est une surface neutre, pas un aplat.">
        <Cote>
          <Tabs defaultValue="identite">
            <TabsList><TabsTrigger value="identite">Identité</TabsTrigger><TabsTrigger value="moyens">Moyens</TabsTrigger><TabsTrigger value="certifications">Certifications</TabsTrigger></TabsList>
            <TabsContent value="identite" className="text-sm text-fg-2">Raison sociale, SIRET, effectif.</TabsContent>
            <TabsContent value="moyens" className="text-sm text-fg-2">Matériel et équipes.</TabsContent>
            <TabsContent value="certifications" className="text-sm text-fg-2">Qualibat, MASE, ISO.</TabsContent>
          </Tabs>
        </Cote>
      </Section>

      <Section id="surcouches" titre="Dialogue, confirmation, menu, infobulle, tiroir, feuille du bas, toast" note="Un seul de chaque, sur Radix : piège de focus, Échap, retour du focus. Ils s’ouvrent dans le thème courant. Menu et liste : 180 ms ; dialogue et feuille : 280 ms ; fermeture : 100 ms. Voile sans flou. Le toast se pose en bas de l’écran, jamais sur la barre du haut.">
        <Surcouches />
      </Section>

      <Section id="messages" titre="Messages en ligne" note="Là où le fait se produit, une seule fois. Une icône, une phrase qui dit ce qui s’est passé et quoi faire, une action au plus.">
        <Cote>
          <div className="grid gap-3">
            <Message ton="info" titre="Plan proposé : 11 parties">Vous pouvez changer l’ordre avant de rédiger.</Message>
            <Message ton="succes">Le plan est enregistré.</Message>
            <Message ton="attention" titre="La lecture n’a pas pu démarrer" action={<Bouton>Réessayer</Bouton>}>Le service de lecture ne répond pas pour l’instant.</Message>
            <Message ton="erreur" titre="Le plan n’a pas pu être enregistré" onFermer={() => {}}>Vos modifications restent ici ; réessayez dans un instant.</Message>
          </div>
        </Cote>
      </Section>

      <Section id="etats" titre="Chargement, erreur, vide" note="Toujours dans cet ordre : chargement, erreur, vide, contenu (<EtatRequete>). Chargement : rien pendant 200 ms, puis un squelette fixe aux dimensions du contenu, visible 400 ms au moins ; il ne pulse pas. Une erreur dit ce qui n’a pas pu se faire et propose de réessayer : elle ne s’affiche jamais comme « vous n’avez rien ». Un état vide tient en trois éléments.">
        <Cote>
          <div className="grid gap-4">
            <div aria-busy="true" className="rounded-carte border border-bord bg-surface-0 p-5">
              <Squelette className="h-5 w-48" />
              <SqueletteLignes className="mt-4" />
              <div className="mt-4 flex gap-2"><Squelette className="h-11 w-32 rounded-lg" /><Squelette className="h-11 w-24 rounded-lg" /></div>
            </div>
            <EtatErreur onReessayer={() => {}} />
            <EtatVide titre="Votre premier dossier se prépare ici" phrase="Déposez le dossier de l’acheteur : Synorix lit les pièces et repère les lots." action={<Bouton>Déposer un dossier</Bouton>} />
            <EtatVide titre="Aucun appel d’offres ne correspond à ces filtres" parFiltre={() => {}} />
          </div>
        </Cote>
      </Section>

      <Section id="visage" titre="Synorix parle" note="Le visage n’apparaît que là où Synorix parle, à côté de sa phrase, une fois par écran au plus (il est ici la seule fois de cette page). Jamais en vignette d’un appel d’offres, jamais en décor. Il est à sa taille sur Mon entreprise.">
        <Carte>
          <SynorixParle action={<Bouton>Réunir les pièces</Bouton>}>Il reste deux pièces à joindre avant de télécharger le dossier.</SynorixParle>
        </Carte>
      </Section>

      <Section id="mouvement" titre="Mouvement" note="Trois durées, une courbe. Transform, opacité et couleurs seulement, propriété par propriété.">
        <Cote><Mouvement /></Cote>
      </Section>

      <Section id="icones" titre="Icônes" note="lucide-react, trait de 1,5 px constant, 20 px, extrémités arrondies ; jamais dans un rond décoratif.">
        <Cote>
          <div className="flex flex-wrap gap-4 text-fg-2">
            {[Search, FolderOpen, Briefcase, Building2, Archive, Users, Settings, Bell, FileText, Plus].map((Icone, i) => (
              <Icone key={i} size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
            ))}
          </div>
        </Cote>
      </Section>
    </Page>
  )
}
