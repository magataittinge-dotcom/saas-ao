// Socle — LE jeu de composants du système (components/ui) : chaque composant, ses états, ses règles (VEILLE-DESIGN P1, P11,
// P14, P17, P20 à P23, P29). Les anciens noms (Button, Input, Card, Badge, Skeleton, StatusBadge, DeleteConfirmModal, Toast…)
// sont des alias minces vers lui. Classes réellement générées par Tailwind, aucune couleur en dur, focus jamais supprimé.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { Bouton, BoutonIcone, classesBouton } from '@/components/ui/bouton'
import { Button } from '@/components/ui/button'
import { Champ, ChampDate, ChampNombre, ChampRecherche, GroupeChamp, ZoneTexte, dateDepuisSaisie, saisieDepuisDate } from '@/components/ui/champ'
import { Input, Textarea } from '@/components/ui/input'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { CaseACocher, GroupeRadio } from '@/components/ui/case'
import { Interrupteur } from '@/components/ui/interrupteur'
import { EffacerFiltres, PuceFiltre } from '@/components/ui/filtre'
import { Carte, RangeeCarte, TitreCarte } from '@/components/ui/carte'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PastilleCompte, PastilleEtat, type Sens } from '@/components/ui/pastille'
import { Badge } from '@/components/ui/badge'
import { BandeCases, CaseResume } from '@/components/ui/case-resume'
import { Tableau, libellePage } from '@/components/ui/tableau'
import { DELAI_SQUELETTE_MS, DUREE_MIN_SQUELETTE_MS, Squelette, SqueletteLignes, phaseAttente } from '@/components/ui/squelette'
import { EtatErreur, EtatRequete, EtatVide } from '@/components/ui/etats'
import { Message } from '@/components/ui/message'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/common/StatusBadge'
import EchecAction from '@/components/common/EchecAction'
import Skeleton from '@/components/common/Skeleton'
import { phaseRequete } from '@/lib/requete'
import { RACINE, lire, sansCommentaires } from './outils/sources'

const FICHIERS = readdirSync(path.join(RACINE, 'src/components/ui')).filter((f) => f.endsWith('.tsx') && !['sidebar.tsx', 'CompanionOrb.tsx'].includes(f)).map((f) => `src/components/ui/${f}`)
const r = renderToStaticMarkup

test('Bouton : cinq variantes, 44 px, survol sans mouvement, appui scale(.98), désactivé à 45 %, en cours = le libellé change', () => {
  const principal = r(<Bouton variante="principal">Télécharger le dossier</Bouton>)
  for (const c of ['min-h-11', 'rounded-pilule', 'bg-accent-fill', 'text-accent-on', 'shadow-cta', 'hover:[background-image:var(--accent-fill-hover)]', 'active:scale-[.98]', 'duration-fast', 'disabled:opacity-45']) assert.ok(principal.includes(c), c)
  assert.doesNotMatch(principal, /translate-y|transition-all/, 'au survol rien ne bouge')
  const secondaire = r(<Bouton>Annuler</Bouton>)
  assert.match(secondaire, /data-variante="secondaire"/)
  for (const c of ['rounded-lg', 'border-bord-champ', 'bg-surface-0', 'hover:bg-surface-1', 'active:bg-surface-2']) assert.ok(secondaire.includes(c), c)
  // un bouton destructeur n'est jamais un aplat
  const danger = r(<Bouton variante="danger">Supprimer</Bouton>)
  assert.match(danger, /border-rouge-mark/)
  assert.doesNotMatch(danger, /bg-accent-fill|bg-danger-solid|bg-rouge-mark/)
  // en cours : le libellé change, le bouton se désactive ; aucune roue qui tourne
  const enCours = r(<Bouton variante="principal" enCours libelleEnCours="Enregistrement…">Enregistrer</Bouton>)
  assert.match(enCours, /<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Enregistrement…<\/button>/)
  assert.doesNotMatch(enCours, /animate-spin|<svg/)
  assert.match(r(<Bouton asChild variante="secondaire"><a href="/x">Ouvrir</a></Bouton>), /^<a [^>]*href="\/x"/)
  for (const v of ['principal', 'secondaire', 'discret', 'danger', 'lien'] as const) assert.ok(classesBouton(v).length > 40, v)
  assert.match(r(<BoutonIcone libelle="Fermer"><svg /></BoutonIcone>), /aria-label="Fermer"[^>]*class="[^"]*size-11/)
  // alias : l'ancien Button renvoie au Bouton du système
  assert.match(r(<Button variant="default" size="lg" disabled>Enregistrer</Button>), /data-variante="principal"[^>]*disabled/)
  assert.match(r(<Button variant="destructive">x</Button>), /data-variante="danger"/)
  assert.match(r(<Button variant="outline">x</Button>), /data-variante="secondaire"/)
  assert.match(r(<Button variant="ghost">x</Button>), /data-variante="discret"/)
})

test('Champs : une forme par rôle (rectangle de 14 px, 44 px ; recherche en pilule), survol, focus, erreur, désactivé, 16 px au téléphone', () => {
  const html = r(<Champ placeholder="Nom" aria-invalid="true" />)
  for (const c of ['h-11', 'rounded-lg', 'border-bord-champ', 'hover:border-fg-3', 'focus-visible:border-accent-ring', 'aria-[invalid=true]:border-rouge-mark', 'disabled:bg-surface-1', 'placeholder:text-fg-3', 'max-[768px]:text-saisie']) assert.ok(html.includes(c), c)
  assert.match(r(<ZoneTexte defaultValue="a" />), /<textarea[^>]*min-h-24/)
  assert.match(r(<ChampRecherche placeholder="Rechercher" />), /type="search"[^>]*rounded-pilule/)
  assert.equal(r(<Input placeholder="x" />), r(<Champ placeholder="x" />), 'Input est un alias de Champ')
  assert.match(r(<Textarea />), /<textarea/)
  // date et nombre : aucun contrôle natif
  const date = r(<ChampDate valeur="2027-03-12" onChange={() => {}} />)
  assert.match(date, /type="text"[^>]*inputMode="numeric"|inputMode="numeric"[^>]*type="text"/i)
  assert.match(date, /value="12\/03\/2027"/)
  assert.doesNotMatch(date, /type="date"/)
  assert.equal(dateDepuisSaisie('12/03/2027'), '2027-03-12')
  assert.equal(dateDepuisSaisie('31/02/2027'), null)
  assert.equal(dateDepuisSaisie('demain'), null)
  assert.equal(saisieDepuisDate('2026-11-10T08:00:00'), '10/11/2026')
  const nombre = r(<ChampNombre valeur={12.5} onChange={() => {}} unite="%" />)
  assert.doesNotMatch(nombre, /type="number"/)
  assert.match(nombre, /value="12,5"/)
  assert.match(nombre, /text-right/)
  // le groupe : libellé relié, erreur annoncée, qui nomme la correction
  const groupe = r(<GroupeChamp libelle="SIRET" erreur="Le SIRET compte 14 chiffres."><Champ /></GroupeChamp>)
  const id = groupe.match(/<label for="([^"]+)"/)?.[1]
  assert.ok(id)
  assert.match(groupe, new RegExp(`<input[^>]*id="${id}"[^>]*aria-invalid="true"`))
  assert.match(groupe, /role="alert"[^>]*>.*Le SIRET compte 14 chiffres\./)
})

test('Liste déroulante, case, radio, interrupteur : dessinés, au clavier, 44 px ; la sélection n\'est jamais un aplat', () => {
  const liste = r(<ListeDeroulante libelle="Trier par" valeur="remise" onChange={() => {}} options={[{ valeur: 'remise', libelle: 'Remise la plus proche' }, { valeur: 'nom', libelle: 'Nom' }]} />)
  assert.match(liste, /role="combobox"/)
  assert.match(liste, /aria-label="Trier par"/)
  for (const c of ['h-11', 'rounded-lg', 'border-bord-champ']) assert.ok(liste.includes(c), c)
  assert.match(r(<CaseACocher libelle="Mettre à jour mon profil" coche onChange={() => {}} />), /role="checkbox"[^>]*aria-checked="true"/)
  const radio = r(<GroupeRadio libelle="Résultat" valeur="gagne" onChange={() => {}} options={[{ valeur: 'gagne', libelle: 'Gagné' }, { valeur: 'perdu', libelle: 'Perdu' }]} />)
  assert.match(radio, /role="radiogroup"[^>]*aria-label="Résultat"/)
  assert.equal((radio.match(/class="peer sr-only"/g) ?? []).length, 2)
  assert.doesNotMatch(radio, /bg-accent-fill/)
  const inter = r(<Interrupteur libelle="Animer le fond" coche={false} onChange={() => {}} />)
  assert.match(inter, /role="switch"[^>]*aria-checked="false"/)
  assert.match(inter, /min-h-11/)
})

test('Filtre : une puce à deux états ; active, elle porte sa valeur et sa croix ; « Effacer les filtres » seulement si un filtre est actif', () => {
  const propose = r(<PuceFiltre libelle="Métier" onOuvrir={() => {}} />)
  assert.match(propose, /data-filtre="propose"/)
  assert.match(propose, /rounded-pilule/)
  const actif = r(<PuceFiltre libelle="Métier" valeur="Gros œuvre" onOuvrir={() => {}} onRetirer={() => {}} />)
  assert.match(actif, /data-filtre="actif"/)
  for (const c of ['bg-bleu-soft', 'text-bleu-ink', 'border-bleu-mark']) assert.ok(actif.includes(c), c)
  assert.match(actif, /Gros œuvre/)
  assert.match(actif, /aria-label="Retirer le filtre Métier"/)
  assert.doesNotMatch(actif, /bg-accent-fill|bg-accent-600/, 'une sélection n\'est jamais un aplat')
  assert.equal(r(<EffacerFiltres actifs={0} onEffacer={() => {}} />), '')
  assert.match(r(<EffacerFiltres actifs={2} onEffacer={() => {}} />), /Effacer les filtres/)
})

test('Carte : papier, trait de 1 px, rayon 22, plate au repos ; rangées à filet ; le titre n\'est jamais en serif', () => {
  const carte = r(<Carte cliquable><TitreCarte>Titre</TitreCarte><RangeeCarte>a</RangeeCarte></Carte>)
  for (const c of ['rounded-carte', 'border-bord', 'bg-surface-0', 'shadow-card', 'hover:border-bord-2']) assert.ok(carte.includes(c), c)
  assert.match(carte, /data-surface/)
  assert.doesNotMatch(carte, /hover:shadow|font-display|translate/)
  assert.match(carte, /<h3 class="text-lg font-semibold/)
  assert.match(carte, /min-h-\[52px\]/)
  assert.match(r(<Card interactive><CardHeader><CardTitle>Titre</CardTitle></CardHeader><CardContent>Corps</CardContent></Card>), /data-surface=""[^>]*rounded-carte border border-bord bg-surface-0/)
})

test('Pastille d\'état : six sens, un mot et une icône, jamais la couleur seule ; les anciens noms y renvoient', () => {
  for (const sens of ['bleu', 'vert', 'ambre', 'rouge', 'turquoise', 'gris'] as Sens[]) {
    const html = r(<PastilleEtat sens={sens}>À joindre</PastilleEtat>)
    assert.match(html, new RegExp(`bg-${sens}-soft text-${sens}-ink`), sens)
    assert.match(html, /<svg[^>]*aria-hidden="true"/, `${sens} : icône`)
    assert.match(html, />À joindre<\/span>$/)
    assert.doesNotMatch(html, /uppercase|font-mono|aurore|flamme/)
  }
  assert.match(r(<Badge variant="warning">À renouveler</Badge>), /bg-ambre-soft text-ambre-ink/)
  assert.match(r(<StatusBadge label="Gagné" variant="success" />), /data-sens="vert"/)
  assert.match(r(<PastilleCompte valeur={3} sens="rouge" />), /border-rouge-mark[^>]*>3</)
})

test('Case de résumé : l\'étiquette en haut, le gros chiffre seul ; rien à compter = « Aucune », jamais un gros 0 ni l\'étiquette redite', () => {
  const pleine = r(<CaseResume etiquette="En cours" valeur={3} />)
  assert.ok(pleine.indexOf('data-etiquette') < pleine.indexOf('data-valeur'), 'étiquette avant la valeur')
  assert.match(pleine, /<span class="chiffre-grand">3<\/span>/)
  assert.equal((pleine.match(/chiffre-grand/g) ?? []).length, 1)
  assert.equal((pleine.match(/[Ee]n cours/g) ?? []).length, 1, 'l\'étiquette n\'est écrite qu\'une fois')
  const rien = r(<CaseResume etiquette="Remises sous 7 jours" valeur={0} rien="Aucune" />)
  assert.match(rien, /data-valeur="rien"[^>]*>Aucune</)
  assert.doesNotMatch(rien, /chiffre-grand|>0</)
  assert.equal((rien.match(/[Rr]emises? sous 7 jours/g) ?? []).length, 1)
  // une valeur en texte qui redit l'étiquette en est débarrassée
  assert.match(r(<CaseResume etiquette="En cours" valeur="3 en cours" />), /data-valeur="texte"[^>]*>3</)
  assert.match(r(<CaseResume etiquette="À poser" valeur={2} unite="questions" />), /chiffre-grand">2<\/span><span[^>]*>questions</)
  const bande = r(<BandeCases><CaseResume etiquette="A" valeur={1} /><CaseResume etiquette="B" valeur={2} /><CaseResume etiquette="C" valeur={null} /></BandeCases>)
  assert.equal((bande.match(/data-surface/g) ?? []).length, 1, 'une seule surface, découpée par des filets')
  assert.match(bande, /md:divide-x/)
  assert.match(bande, /md:grid-cols-3/)
})

test('Tableau : filets horizontaux, rangées de 52 px, nombres à droite ; 0 ligne = l\'état vide, sans tableau ; pages de 50', () => {
  type L = { id: string; nom: string; montant: number }
  const colonnes = [{ cle: 'nom', titre: 'Nom', rendu: (l: L) => l.nom }, { cle: 'montant', titre: 'Montant', nombre: true, rendu: (l: L) => l.montant }]
  const lignes: L[] = Array.from({ length: 500 }, (_, i) => ({ id: `l${i}`, nom: `Ligne ${i + 1}`, montant: i }))
  const html = r(<Tableau libelle="Pièces" colonnes={colonnes} lignes={lignes} cle={(l) => l.id} vide={<EtatVide titre="Rien" />} />)
  assert.ok((html.match(/<tr/g) ?? []).length <= 60, 'au plus 60 rangées dans la page')
  assert.match(html, /1–50 sur 500/)
  assert.equal(libellePage(1, 142), '51–100 sur 142')
  assert.match(html, /<td data-nombre=""[^>]*chiffres text-right/)
  assert.match(html, /h-\[52px\]/)
  assert.doesNotMatch(html, /border-[lrx](-|\b)|odd:|even:|uppercase/, 'ni trait vertical, ni zébrure, ni capitales')
  assert.match(html, /<th scope="col"[^>]*text-xs font-medium text-fg-3/)
  const vide = r(<Tableau libelle="Pièces" colonnes={colonnes} lignes={[]} cle={(l) => l.id} vide={<EtatVide titre="Les pièces arriveront ici" />} />)
  assert.doesNotMatch(vide, /<table|<thead/)
  assert.match(vide, /data-etat-vide/)
})

test('Squelette : fixe, à la glace du thème, décoratif ; rien pendant 200 ms, puis visible 400 ms au moins', () => {
  const html = r(<Squelette className="h-4 w-20" />)
  assert.match(html, /aria-hidden="true"[^>]*data-squelette/)
  assert.match(html, /bg-surface-1/)
  assert.doesNotMatch(html + r(<SqueletteLignes />) + r(<Skeleton className="h-3" />), /animate-|shimmer|pulse/, 'rien ne boucle')
  assert.match(r(<Skeleton className="h-3" />), /data-squelette/, 'common/Skeleton est un alias')
  assert.equal(DELAI_SQUELETTE_MS, 200)
  assert.equal(DUREE_MIN_SQUELETTE_MS, 400)
  // horloge simulée : rien à 150 ms, présent à 250 ms, encore présent 399 ms après son apparition même si tout est arrivé
  assert.equal(phaseAttente(true, 150, 0, null), 'rien')
  assert.equal(phaseAttente(true, 250, 0, null), 'squelette')
  assert.equal(phaseAttente(false, 250 + 399, 0, 250), 'squelette')
  assert.equal(phaseAttente(false, 250 + 400, 0, 250), 'contenu')
  assert.equal(phaseAttente(false, 100, 0, null), 'contenu', 'réponse avant 200 ms : aucun squelette')
})

test('États : chargement → erreur → vide → contenu, dans cet ordre ; une erreur n\'est jamais « vous n\'avez rien »', () => {
  assert.equal(phaseRequete({ data: undefined, isLoading: true, isError: false }), 'chargement')
  assert.equal(phaseRequete({ data: undefined, isLoading: false, isError: true }), 'erreur')
  assert.equal(phaseRequete({ data: [], isLoading: false, isError: false }), 'vide')
  assert.equal(phaseRequete({ data: [1], isLoading: false, isError: false }), 'contenu')
  assert.equal(phaseRequete({ data: [1], isLoading: false, isError: true }), 'contenu', 'des données déjà là restent affichées')
  const base = { squelette: <Squelette className="h-10" />, vide: <EtatVide titre="Votre premier dossier se prépare ici" /> }
  const erreur = r(<EtatRequete requete={{ data: undefined as number[] | undefined, isLoading: false, isError: true }} {...base}>{(d) => <p>{d.length}</p>}</EtatRequete>)
  assert.match(erreur, /data-phase="erreur"/)
  assert.match(erreur, /data-etat-erreur/)
  assert.doesNotMatch(erreur, /premier dossier/, 'l\'erreur ne s\'affiche pas comme un écran vide')
  const vide = r(<EtatRequete requete={{ data: [] as number[], isLoading: false, isError: false }} {...base}>{(d) => <p>{d.length}</p>}</EtatRequete>)
  assert.match(vide, /premier dossier/)
  const contenu = r(<EtatRequete requete={{ data: [1, 2], isLoading: false, isError: false }} {...base}>{(d) => <p>{d.length} lignes</p>}</EtatRequete>)
  assert.match(contenu, /<p>2 lignes<\/p>/)
  // état vide : trois éléments ; vide par filtre : « Effacer les filtres », jamais une invitation à créer
  const etatVide = r(<EtatVide titre="Les avis arriveront ici" phrase="Synorix cherche chaque matin." action={<Bouton variante="principal">Régler la veille</Bouton>} />)
  assert.ok((etatVide.match(/<button/g) ?? []).length <= 2)
  assert.doesNotMatch(etatVide, /border-dashed|\(0\)/)
  const filtre = r(<EtatVide titre="Aucun AO ne correspond" parFiltre={() => {}} action={<Bouton variante="principal">Nouvel AO</Bouton>} />)
  assert.match(filtre, /Effacer les filtres/)
  assert.doesNotMatch(filtre, /Nouvel AO/)
  const etatErreur = r(<EtatErreur onReessayer={() => {}} />)
  assert.match(etatErreur, /role="alert"/)
  assert.match(etatErreur, />Réessayer</)
  assert.doesNotMatch(etatErreur, /Error|stack|!/)
})

test('Message : une icône, une phrase, une action ; annoncé ; pas de bordure latérale colorée ; EchecAction y renvoie', () => {
  const html = r(<Message ton="erreur" titre="Le plan n’a pas pu être enregistré">Vos modifications restent ici.</Message>)
  assert.match(html, /role="alert"/)
  assert.match(html, /bg-rouge-soft/)
  assert.match(html, /<svg[^>]*text-rouge-ink/)
  assert.doesNotMatch(html, /border-l-|border-r-/)
  assert.match(r(<Message ton="succes">Enregistré.</Message>), /role="status"/)
  const echec = r(<EchecAction message="La lecture n’a pas pu démarrer." onReessayer={() => {}} />)
  assert.match(echec, /data-message="erreur"/) // un échec est rouge (jury, tour 1)
  assert.match(echec, />Réessayer</)
})

test('« Synorix parle » : un visage, collé à sa phrase, décoratif', () => {
  const html = r(<SynorixParle>Il reste deux pièces à joindre avant de télécharger le dossier.</SynorixParle>)
  assert.equal((html.match(/data-visage=/g) ?? []).length, 1)
  assert.match(html, /data-visage=""[^>]*|aria-hidden="true"[^>]*data-visage/)
  assert.match(html, /<p data-voix-synorix=""[^>]*>Il reste deux pièces/)
  assert.doesNotMatch(html, /<video|autoplay/)
})

test('Dialogue, menu, tiroir : un seul de chaque, sur Radix ; ouvertures réglées une fois dans index.css ; voile sans flou', () => {
  const dialogue = sansCommentaires(lire('src/components/ui/dialogue.tsx'))
  assert.match(dialogue, /from '@radix-ui\/react-dialog'/)
  assert.match(dialogue, /dialogue-flottant/)
  assert.doesNotMatch(dialogue, /backdrop-blur|createPortal/)
  assert.match(dialogue, /variante=\{danger \? 'danger' : 'principal'\}/)
  assert.match(sansCommentaires(lire('src/components/ui/menu.tsx')), /from '@radix-ui\/react-dropdown-menu'/)
  for (const f of ['src/components/common/DeleteConfirmModal.tsx', 'src/components/etape/MenuLigne.tsx']) assert.doesNotMatch(sansCommentaires(lire(f)), /createPortal|addEventListener/, f)
  const css = sansCommentaires(lire('src/index.css'))
  assert.match(css, /\.menu-flottant\[data-state="open"\] \{ animation: ouvrir-flottant var\(--dur-survol\) var\(--ease-survol\); \}/)
  assert.match(css, /\.dialogue-flottant\[data-state="open"\] \{ animation: ouvrir-flottant var\(--dur-pop\) var\(--ease-survol\); \}/)
  const onglets = r(<Tabs defaultValue="a"><TabsList><TabsTrigger value="a">Identité</TabsTrigger><TabsTrigger value="b">Moyens</TabsTrigger></TabsList><TabsContent value="a">A</TabsContent></Tabs>)
  assert.match(onglets, /role="tablist"/)
  assert.match(onglets, /role="tab"[^>]*aria-selected="true"/)
})

test('aucune couleur en dur dans les composants, anneau de focus jamais supprimé, aucune boucle, aucune capitale forcée', () => {
  const trouves: string[] = []
  for (const f of FICHIERS) {
    const code = sansCommentaires(lire(f))
    for (const m of code.matchAll(/#[0-9A-Fa-f]{3,8}\b|hsla?\(|rgba?\(/g)) trouves.push(`${f} : ${m[0]}`)
    if (/focus-visible:outline-none|focus:outline-none/.test(code) && !/focus-visible:outline-|focus-visible:ring|focus-visible:border/.test(code)) trouves.push(`${f} : focus supprimé`)
    if (/\bring-offset-background\b/.test(code)) trouves.push(`${f} : ancien anneau`)
    if (/animate-(spin|pulse|ping|bounce)|\buppercase\b|transition-all|font-mono|backdrop-blur/.test(code)) trouves.push(`${f} : boucle, capitales, transition-all, mono ou flou`)
  }
  assert.deepEqual(trouves, [])
})

test('les classes de jetons des composants existent vraiment dans le CSS généré par Tailwind', () => {
  const script = `
    const postcss = require('postcss'); const tailwind = require('tailwindcss');
    postcss([tailwind({ config: './tailwind.config.js', content: ${JSON.stringify(FICHIERS)} })])
      .process('@tailwind utilities;', { from: undefined }).then((r) => process.stdout.write(r.css))`
  const css = execFileSync(process.execPath, ['-e', script], { cwd: RACINE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const attendues = ['bg-accent-fill', 'text-accent-on', 'bg-surface-0', 'bg-surface-1', 'bg-surface-2', 'bg-surface-pop', 'text-fg', 'text-fg-2', 'text-fg-3', 'border-bord', 'border-bord-champ',
    'bg-bleu-soft', 'text-bleu-ink', 'border-bleu-mark', 'bg-vert-soft', 'bg-ambre-soft', 'bg-rouge-soft', 'text-rouge-ink', 'border-rouge-mark', 'bg-turquoise-soft', 'bg-gris-soft',
    'text-accent-text', 'bg-accent-ui', 'rounded-carte', 'rounded-pilule', 'rounded-lg', 'rounded-md', 'shadow-cta', 'shadow-card', 'shadow-flottant', 'shadow-toast',
    'duration-fast', 'duration-survol', 'ease-survol', 'text-xs', 'text-sm', 'text-base', 'text-lg', 'bg-voile', 'min-h-11', 'h-11', 'size-11']
  const absentes = attendues.filter((c) => !css.includes(`.${c.replace(/[:/[\]]/g, '\\$&')}`))
  assert.deepEqual(absentes, [])
  assert.ok(css.includes('text-saisie'), 'text-saisie')
  assert.ok(!/NaN/.test(css), 'valeur d\'opacité invalide')
  // les noms de Tailwind renvoient bien aux jetons
  assert.match(css, /\.text-sm\s*\{\s*font-size: var\(--taille-13\)/)
  assert.match(css, /\.rounded-lg\s*\{\s*border-radius: var\(--radius-md\)/)
  assert.match(css, /\.duration-fast\s*\{\s*transition-duration: var\(--dur-fast\)/)
})
