// Bloc 9, tranche 4 — « L'AO en 30 secondes » : fonction pure, données inventées,
// aucune couleur dans le JSX, aucune valeur de prix, lisible à 390 px.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { construireCarteAO, dateLongue, type EntreeCarte } from '@/lib/carteAO'
import { CarteAO30sVue } from '@/components/project/CarteAO30s'
import { lire } from './outils/sources'

const SOURCE_RC = { document: 'RC', page: 4, excerpt: 'Les offres sont remises avant le 20 novembre 2026 à 12h00.' }

const entree = (over: Partial<EntreeCarte> = {}): EntreeCarte => ({
  projet: {
    name: 'Rénovation du gymnase',
    selected_lot_name: 'Lot 03 — Menuiseries',
    infos_marche: { objet: 'Rénovation de la toiture du gymnase municipal', maitre_ouvrage: 'Commune de Valdoie-sur-Mer', montant_estime: '350 000 €' } as never,
  },
  champs: {
    date_limite_remise: { value: { date: '2026-11-20', heure: '12h00' }, source: SOURCE_RC },
    visite_site: { value: { statut: 'obligatoire', date: null }, source: { document: 'RC', page: 5, excerpt: 'Visite obligatoire.' } },
    criteres: { value: [{ nom: 'Valeur technique', poids: 60 }, { nom: 'Prix', poids: 40 }], source: { document: 'RC', page: 6, excerpt: 'Jugement des offres' } },
    delai_execution: { value: '6 mois à compter de l’ordre de service', source: { document: 'CCAP', page: 2, excerpt: 'Le délai est de 6 mois.' } },
  },
  pieces: [
    { status: 'present', jointe: true, valable_jusqu_au: '2027-03-01' },
    { status: 'manquant' },
    { status: 'manquant' },
  ],
  conditions: { relevees: 5, aConfirmer: 2 },
  maintenant: new Date(2026, 10, 10, 9, 0, 0),
  ...over,
})

const parId = (faits: ReturnType<typeof construireCarteAO>) => Object.fromEntries(faits.map((f) => [f.id, f]))

test('la carte résume l’AO depuis l’analyse déjà en base, fait par fait', () => {
  const f = parId(construireCarteAO(entree()))
  assert.equal(f.acheteur.valeur, 'Commune de Valdoie-sur-Mer')
  assert.equal(f.objet.valeur, 'Rénovation de la toiture du gymnase municipal')
  assert.equal(f.lots.valeur, 'Lot 03 — Menuiseries')
  assert.equal(f.remise.valeur, 'vendredi 20 novembre 2026 · 12h00')
  assert.equal(f.remise.reste, 'dans 10 jours')
  assert.deepEqual(f.remise.source, SOURCE_RC)
  assert.equal(f.visite.valeur, 'Obligatoire')
  assert.equal(f.visite.reste, 'date à planifier')
  assert.equal(f.visite.action, true)
  assert.equal(f.pieces.valeur, '2 pièces à joindre · 1 prête')
  assert.equal(f.criteres.valeur, 'Valeur technique 60 % · Prix 40 %')
  assert.equal(f.criteres.source?.document, 'RC')
  assert.equal(f.delai.valeur, '6 mois à compter de l’ordre de service')
  assert.equal(f.delai.source?.document, 'CCAP')
  assert.equal(f.decision.valeur, '5 conditions relevées dans le DCE')
  assert.equal(f.decision.reste, '2 à confirmer par vous')
})

test('jamais de montant ni d’avis de prix : le montant estimé n’est pas repris', () => {
  const texte = JSON.stringify(construireCarteAO(entree()))
  assert.ok(!texte.includes('350 000'), 'le montant du marché ne figure pas dans la carte')
  assert.ok(!/€|euro|trop cher|compétitif|marge|tarif/i.test(texte))
})

test('un fait sans donnée n’est pas affiché', () => {
  const vide = construireCarteAO({ projet: {}, maintenant: new Date(2026, 10, 10) })
  assert.deepEqual(vide, [])
  const partiel = parId(construireCarteAO({ projet: { infos_marche: { objet: 'Objet inventé' } } }))
  assert.deepEqual(Object.keys(partiel), ['objet'])
})

test('temps restant : demain, aujourd’hui avec l’heure, date passée', () => {
  const avec = (date: string, heure: string | null, maintenant: Date) =>
    parId(construireCarteAO({ projet: { echeance: { date, heure } }, maintenant })).remise
  assert.equal(avec('2026-11-11', null, new Date(2026, 10, 10, 9)).reste, 'demain')
  const jour = avec('2026-11-10', '14h00', new Date(2026, 10, 10, 9))
  assert.equal(jour.reste, 'aujourd’hui, avant 14h00')
  assert.equal(jour.action, true)
  assert.equal(avec('2026-11-01', null, new Date(2026, 10, 10, 9)).reste, 'date de remise passée')
  // sans champ lu dans le RC : l’échéance consolidée de l’AO, sans source
  assert.equal(avec('2026-11-30', null, new Date(2026, 10, 10)).source, null)
})

test('visite facultative ou non mentionnée', () => {
  const v = (statut: 'facultative' | 'non_mentionnee') => parId(construireCarteAO({
    projet: {}, champs: { visite_site: { value: { statut, date: null }, source: null } },
  })).visite
  assert.equal(v('facultative').valeur, 'Facultative')
  assert.equal(v('facultative').action, false)
  assert.equal(v('non_mentionnee').valeur, 'Non mentionnée dans le DCE')
})

test('les critères de l’AO servent de repli quand le RC n’a pas été lu', () => {
  const f = parId(construireCarteAO({ projet: { criteres_jugement: [{ nom: 'Prix', poids: 30 }, { nom: 'Technique', poids: 70 }] } }))
  assert.equal(f.criteres.valeur, 'Prix 30 % · Technique 70 %')
  assert.equal(f.criteres.source, null)
})

test('date longue en français', () => {
  assert.equal(dateLongue('2026-11-20'), 'vendredi 20 novembre 2026')
  assert.equal(dateLongue('2027-01-01'), 'vendredi 1 janvier 2027')
})

test('le rendu : titre, source cliquable, classes sémantiques, aucune couleur en dur', () => {
  const html = renderToStaticMarkup(<CarteAO30sVue faits={construireCarteAO(entree())} onOpenSource={() => {}} />)
  assert.ok(html.includes('L’AO en 30 secondes'))
  assert.ok(html.includes('carte-ao-30s__fait--large'))
  assert.ok(html.includes('carte-ao-30s__valeur--action'))
  assert.ok(html.includes('aria-label="Voir dans le DCE : Remise des offres"'))
  assert.ok(!/style=|#[0-9a-f]{3,8}\b/i.test(html), 'aucun style en ligne ni couleur')
  for (const code of ['CarteAO30s.tsx', '../../lib/carteAO.ts']) {
    const src = code.startsWith('..') ? lire('src/lib/carteAO.ts') : lire(`src/components/project/${code}`)
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(src), `${code} ne porte aucune couleur`)
  }
})

test('lisible à 390 px : une colonne, pas de défilement horizontal, cibles de 44 px', () => {
  const css = lire('src/styles/pieces.css')
  const faits = css.match(/\.carte-ao-30s__faits\s*\{[^}]*\}/)?.[0] ?? ''
  assert.ok(/grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(faits), 'une seule colonne par défaut')
  assert.ok(/@media \(min-width: 640px\)[\s\S]*repeat\(2/.test(css), 'deux colonnes seulement à partir de 640 px')
  assert.ok(/\.carte-ao-30s__fait\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css), 'les longs textes passent à la ligne')
  assert.ok(/\.carte-ao-30s__source\s*\{[^}]*min-height:\s*44px/.test(css), 'cible tactile de 44 px')
  assert.ok(!/min-width:\s*\d{3,}px(?![^{]*@media)/.test(faits), 'aucune largeur minimale fixe')
})

test('la carte est en tête de l’analyse', () => {
  const code = lire('src/routes/project/StepAnalysis.tsx')
  const i = code.indexOf('<CarteAO30s')
  assert.ok(i > 0 && i < code.indexOf('<CriticalBanner'), 'avant le bandeau critique')
  assert.ok(i < code.indexOf('HÉROS DE SYNTHÈSE'), 'avant le héros de synthèse')
})
