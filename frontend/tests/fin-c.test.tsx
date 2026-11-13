// FIN-C — second tour du jury, lot c (Mon entreprise, fiches, Coffre-fort, Paramètres, Abonnement, Outils).
// Chaque test porte un défaut du verdict (finale/jury/tour-1/c.md) ou une friction du testeur débutant.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SOUS_TITRE_FICHE, SOUS_TITRE_FICHE_EXACT, sousTitreFiche } from '@/lib/fiche'
import { siretASoumettre } from '@/components/entreprise/ChampSiret'
import { libellePieces, piecesCherchees } from '@/routes/Vault'
import { lectureCompteur, premierDuMois } from '@/routes/Billing'
import { tauxBceDecimal } from '@/routes/Tools'
import { POSTES_PAR_DEFAUT, intitulePoste } from '@/lib/entreprise/charges'
import { INFORMATIONS } from '@/lib/entreprise/avancement'
import { lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'

test('fiches : « exactement ce que vous téléchargez » n’est promis que lorsque l’aperçu exact est à l’écran (bloquant du jury)', () => {
  assert.equal(sousTitreFiche(true), SOUS_TITRE_FICHE_EXACT)
  assert.equal(sousTitreFiche(false), SOUS_TITRE_FICHE)
  assert.match(SOUS_TITRE_FICHE_EXACT, /exactement ce que vous téléchargez/)
  assert.doesNotMatch(SOUS_TITRE_FICHE, /exactement/)
  const page = sansCommentaires(lire('src/routes/FicheEntreprise.tsx'))
  assert.match(page, /sousTitre=\{sousTitreFiche\(!!data && etat\.phase === 'pret'\)\}/, 'la promesse suit la phase de l’aperçu')
  assert.doesNotMatch(page, /exactement ce que vous téléchargez/)
})

test('fiches : un seul mot, « fiche » ; « bordereau » n’est plus écrit à l’écran', () => {
  for (const f of ['src/routes/FicheEntreprise.tsx', 'src/components/fiche/ZoneBordereau.tsx', 'src/components/fiche/ZoneContenu.tsx']) {
    assert.deepEqual(textesAffiches(f).filter((t) => /bordereau/i.test(t.texte) && t.texte !== 'zone-bordereau').map((t) => t.texte), [], f)
  }
})

test('Mon entreprise : un SIRET tapé puis « Enregistrer », sans passer par « Vérifier », part avec l’enregistrement (bug du testeur)', () => {
  // la cause : le champ gardait sa saisie pour lui, et le formulaire écrit par PATCH /organizations/me, qui ne porte pas le SIRET
  assert.equal(siretASoumettre('732 829 320 00074', null), '732 829 320 00074', 'saisi, jamais envoyé : il part')
  assert.equal(siretASoumettre(' 73282932000074 ', ''), '73282932000074')
  assert.equal(siretASoumettre('73282932000074', '732 829 320 00074'), null, 'déjà enregistré : rien à renvoyer')
  assert.equal(siretASoumettre('', '73282932000074'), null, 'champ vidé : rien n’est envoyé (le serveur n’efface pas un SIRET)')
  const form = sansCommentaires(lire('src/components/entreprise/FormIdentite.tsx'))
  assert.match(form, /useFormulaireRubrique\('identite', donnees, undefined, \(\) => siret\.current\?\.enregistrerSaisie\(\) \?\? Promise\.resolve\(null\)\)/)
  assert.match(form, /<ChampSiret ref=\{siret\}/)
  const champ = sansCommentaires(lire('src/components/entreprise/ChampSiret.tsx'))
  assert.match(champ, /enregistrerSaisie: \(\) => \(siretASoumettre\(valeur, siret\) \? verifier\(\) : Promise\.resolve\(null\)\)/)
  // après les écritures du formulaire ; l'organisation rendue par le contrôle (elle porte le SIRET) est celle que l'écran garde
  const hook = sansCommentaires(lire('src/components/entreprise/useFormulaireRubrique.ts'))
  assert.match(hook, /const apresSiret = await apresRef\.current\?\.\(\)\s+if \(apresSiret\) organisation = apresSiret/)
  assert.ok(hook.indexOf("api.patch<Organization>('/organizations/me'") < hook.indexOf('apresRef.current?.()'))
})

test('Mon entreprise : l’échec d’un enregistrement est un message du système au-dessus des boutons ; « Enregistrer » existe aussi en bas (bloquant du jury à 390)', () => {
  const cadre = sansCommentaires(lire('src/components/entreprise/CadreFormulaire.tsx'))
  assert.match(cadre, /<div className=\{cn\('basis-full', className\)\}>\s*<Message ton="erreur" className="max-w-2xl"/, 'sur sa ligne, à la largeur d’une phrase')
  assert.match(cadre, /data-reessayer-enregistrement=""/, 'le message porte le geste')
  assert.match(cadre, /Ce que vous avez saisi reste à l’écran/)
  assert.doesNotMatch(cadre, /max-w-md text-sm|text-rouge-ink/, 'plus de texte rouge nu dans la rangée des boutons')
  assert.doesNotMatch(cadre, /flex shrink-0 flex-wrap/, 'la rangée des boutons peut passer à la ligne sans sortir de l’écran')
  // jury, tour 3 : un seul « Enregistrer » (l'en-tête, puis sa copie collée au défilement) ; plus de second bouton en bas
  assert.doesNotMatch(cadre, /data-enregistrer-bas|data-bas|depuisLeBas/)
  assert.match(cadre, /\{!colle && <Echec etat=\{etat\} idFormulaire=\{idFormulaire\} \/>\}/)
  assert.equal((cadre.match(/variante="principal"/g) ?? []).length, 1, 'un seul aplat : celui de l’en-tête')
})

test('Coffre-fort : la recherche et la position dans la liste se disent en mots', () => {
  const doc = (file_name: string, type = 'autre') => ({ id: file_name, organization_id: 'o', type, category: 'unclassified', file_url: '/x', file_name, status: 'unclassified', uploaded_at: '2026-07-03' }) as never
  const pieces = [doc('Attestation inventée.pdf'), doc('Kbis imaginaire.pdf', 'kbis'), doc('RIB fictif.pdf')]
  assert.equal(piecesCherchees(pieces, '').length, 3)
  assert.deepEqual(piecesCherchees(pieces, 'inventee').map((d: { file_name: string }) => d.file_name), ['Attestation inventée.pdf'], 'sans accents ni casse')
  assert.equal(piecesCherchees(pieces, 'rib FICTIF').length, 1)
  assert.equal(piecesCherchees(pieces, 'zzz').length, 0)
  assert.equal(libellePieces(0, 500), 'Pièces 1 à 50 sur 500')
  assert.equal(libellePieces(9, 500), 'Pièces 451 à 500 sur 500')
})

test('Abonnement : l’écran dit où l’on paie, où l’on change d’offre et où l’on résilie ; le bouton dit qu’il ouvre le portail de paiement (testeur)', () => {
  const page = lire('src/routes/Billing.tsx')
  const textes = textesAffiches('src/routes/Billing.tsx').map((x) => x.texte).join(' | ')
  assert.match(textes, /Ouvrir le portail de paiement sécurisé/)
  assert.doesNotMatch(textes, /Gérer mon abonnement/)
  assert.match(page, /data-ou-gerer=""/)
  for (const mot of [/paiement par carte/i, /changement d’offre|changez d’offre/, /résili/]) assert.match(page.slice(page.indexOf('data-ou-gerer')), mot)
  // décision du fondateur (11/11) : aucun quota écrit en dur dans cette ligne, aucune mise en page propre à une offre
  const ligne = page.slice(page.indexOf('data-ou-gerer'), page.indexOf('</Carte>', page.indexOf('data-ou-gerer')))
  assert.doesNotMatch(ligne, /\d+ (analyses|mémoires)|illimit/)
})

test('Abonnement, unités utilisées : dit une fois, avec un bouton ; « unités » et non « quota » ; « 1er décembre » (bloquant du jury)', () => {
  assert.deepEqual(lectureCompteur({ used: 30, limit: 30 }).mot, 'Tout est utilisé')
  assert.doesNotMatch(lectureCompteur({ used: 30, limit: 30 }).barre, /rouge/, 'la barre pleine ne redit pas le rouge')
  assert.equal(lectureCompteur({ used: 3, limit: 30 }).mot, 'Disponible')
  assert.equal(premierDuMois('1 décembre'), '1er décembre')
  assert.equal(premierDuMois('11 décembre'), '11 décembre')
  const textes = textesAffiches('src/routes/Billing.tsx').map((x) => x.texte).join(' | ')
  assert.doesNotMatch(textes, /[Qq]uota/)
  const page = sansCommentaires(lire('src/routes/Billing.tsx'))
  assert.equal((page.match(/sens="rouge"/g) ?? []).length, 1, 'une seule mention rouge')
  assert.match(page, /data-unites-utilisees=""[\s\S]*Changer d’offre/)
  assert.doesNotMatch(page, /<Message ton="erreur" titre="Quota/)
})

test('Paramètres : la déconnexion est dans la page ; un seul lien vers Mon entreprise (testeur, jury)', () => {
  const page = sansCommentaires(lire('src/routes/Settings.tsx'))
  assert.match(page, /data-deconnexion=""[\s\S]*onClick=\{\(\) => \{ void deconnexion\(\) \}\}[^>]*><LogOut aria-hidden \/>Déconnexion<\/Bouton>/)
  assert.match(page, /const deconnexion = useLogout\(\)/)
  assert.equal((page.match(/to="\/company"/g) ?? []).length, 1)
  assert.doesNotMatch(page, /Abonnement et outils/)
})

test('Retenue de garantie : le taux de la BCE se saisit en pour cent ; mots du chantier, plus de zéro par défaut (jury)', () => {
  assert.equal(tauxBceDecimal(4.15), 0.0415)
  assert.equal(tauxBceDecimal(null), 0)
  assert.equal(tauxBceDecimal(0), 0)
  const textes = textesAffiches('src/routes/Tools.tsx').map((x) => x.texte).join(' | ')
  assert.doesNotMatch(textes, /standard|Options avancées|En décimal|Diviseur|relancez/)
  assert.match(textes, /taux habituel/)
  const page = sansCommentaires(lire('src/routes/Tools.tsx'))
  assert.match(page, /useState<number \| null>\(null\)[\s\S]*taux_bce: tauxBceDecimal\(tauxBcePct\)/)
  assert.doesNotMatch(page, /<Carte>/, 'un formulaire seul sur la page n’est pas dans une carte')
})

test('Mon entreprise dégabarisée : Équipe en tableau, dépôts sur une ligne, rien de compté à zéro, mots du métier (jury)', () => {
  const moyens = sansCommentaires(lire('src/components/entreprise/FormMoyens.tsx'))
  assert.match(moyens, /data-postes=""/)
  assert.match(moyens, /aria-hidden="true"[^>]*>\s*<span>Poste<\/span><span>Nom<\/span><span>Rôle et missions<\/span>/, 'un seul en-tête pour les postes')
  assert.doesNotMatch(moyens, /BLOC_LISTE/, 'plus de carte par poste')
  assert.doesNotMatch(moyens, /aucun nom de salarié n’est demandé/, 'la phrase ne contredit plus la colonne « Nom »')
  assert.equal(intitulePoste('Directeur Travaux'), 'Directeur de travaux')
  assert.equal(intitulePoste('Chef de Chantier'), 'Chef de chantier')
  assert.equal(intitulePoste('Métreur'), 'Métreur')
  assert.deepEqual(POSTES_PAR_DEFAUT().map((x) => x.poste), ['Directeur de travaux', 'Conducteur de travaux', 'Chef de chantier', 'Administration'])
  const depots = sansCommentaires(lire('src/components/entreprise/CasesDepot.tsx'))
  assert.doesNotMatch(depots, /c\.usage|ligneFormats\(c\)/, 'ni troisième niveau de texte ni note de format par dépôt')
  const rubriques = sansCommentaires(lire('src/components/entreprise/RubriquesEntreprise.tsx'))
  assert.match(rubriques, /av\.rempli === 0 \? 'À commencer'/)
  // jury, tour 3 : la même jauge sur les trois rangées (piste seule quand rien n'est saisi), jamais un point de 8 px
  assert.match(rubriques, /<Jauge \{\.\.\.av\} \/>/)
  assert.doesNotMatch(rubriques, /ChevronDown/, 'aucun chevron d’accordéon : la rubrique choisie a sa marque')
  for (const f of ['FormIdentite.tsx', 'FormMoyens.tsx', 'EditeursCertifications.tsx', 'ListesMoyens.tsx']) {
    const code = sansCommentaires(lire(`src/components/entreprise/${f}`))
    assert.equal((code.match(/<ZoneTexte /g) ?? []).length, (code.match(/<ZoneTexte className="resize-none"/g) ?? []).length, `${f} : aucune poignée native`)
  }
  // le mot annoncé par Synorix est celui du champ
  assert.ok(INFORMATIONS.some((i) => i.libelle === 'Nom de l’entreprise') && !INFORMATIONS.some((i) => i.libelle === 'Raison sociale'))
})
