// Phase D, tranche 2 — fiche « prochaine action » : règle déterministe, libellés positifs, lien vers l'écran concerné.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import {
  classerParUrgence, ficheDepuisProjet, ficheVide, lienEtape, prochaineAction, quandRemise, verbeEtape, versEtape, type FicheAction,
} from '@/lib/intelligence/action'
import ProchaineAction from '@/components/intelligence/ProchaineAction'
import { MAINTENANT, projet, remise } from './outils/projetsFactices'

const ids = (l: { id: string }[]) => l.map((p) => p.id)

test('la prochaine action : l’AO à la remise la plus proche, parmi ceux en cours', () => {
  const p = [
    projet('loin', { ...remise('2026-11-20'), current_step: 2 }),
    projet('proche', { ...remise('2026-10-28'), current_step: 6 }),
    projet('milieu', { ...remise('2026-11-06'), current_step: 5 }),
  ]
  assert.equal(prochaineAction(p, MAINTENANT)?.id, 'proche')
  assert.deepEqual(ids(classerParUrgence(p, MAINTENANT)), ['proche', 'milieu', 'loin'])
})

test('l’ordre ne dépend pas de l’ordre d’arrivée des données (déterministe)', () => {
  const p = [
    projet('a', { ...remise('2026-11-06'), name: 'Bardage' }),
    projet('b', { ...remise('2026-11-06'), name: 'Alpha' }),
    projet('c', { ...remise('2026-10-30') }),
    projet('d'),
  ]
  const attendu = ids(classerParUrgence(p, MAINTENANT))
  assert.deepEqual(attendu, ['c', 'b', 'a', 'd'], 'date, puis nom ; sans date en dernier')
  assert.deepEqual(ids(classerParUrgence([...p].reverse(), MAINTENANT)), attendu)
})

test('les AO clos ne sont jamais proposés ; sans AO en cours : null', () => {
  const clos = ['soumis', 'gagné', 'perdu', 'sans_suite'] as const
  const p = clos.map((s, i) => projet(`c${i}`, { status: s, ...remise('2026-10-25') }))
  assert.equal(prochaineAction(p, MAINTENANT), null)
  assert.equal(prochaineAction([], MAINTENANT), null)
  assert.equal(prochaineAction([...p, projet('ok', remise('2026-12-01'))], MAINTENANT)?.id, 'ok')
})

test('une date déjà passée ne passe pas devant un AO daté à venir, ni un AO sans date', () => {
  const p = [
    projet('passee', remise('2026-10-20')),
    projet('sansdate'),
    projet('avenir', remise('2026-12-15')),
  ]
  assert.deepEqual(ids(classerParUrgence(p, MAINTENANT)), ['avenir', 'sansdate', 'passee'])
})

test('un AO qui attend seulement la fin de l’analyse passe après ceux où l’on peut agir', () => {
  const p = [
    projet('analyse', { ...remise('2026-10-27'), current_step: 3, processing_status: 'processing' }),
    projet('agir', { ...remise('2026-11-10'), current_step: 5 }),
  ]
  assert.equal(prochaineAction(p, MAINTENANT)?.id, 'agir')
  // seul en lice : on le montre quand même, avec ce qu'il se passe
  const f = ficheDepuisProjet(p[0], MAINTENANT)
  assert.equal(f.cta?.libelle, 'Analyse en cours')
  assert.match(f.texte, /analyse est en cours/)
})

test('chaque étape mène à son écran, avec le bon verbe', () => {
  const cas: [Parameters<typeof projet>[1], string, string][] = [
    [{ current_step: 1 }, 'Déposer le DCE', '/projects/x/upload'],
    [{ current_step: 2 }, 'Choisir le lot', '/projects/x/lots'],
    [{ current_step: 3 }, "Lancer l'analyse", '/projects/x/analysis'],
    [{ current_step: 3, status: 'analyzed' }, 'Décider : on y va ?', '/projects/x/analysis'],
    [{ current_step: 4 }, 'Vérifier le dossier', '/projects/x/verification'],
    [{ current_step: 5 }, 'Rédiger le mémoire', '/projects/x/memoire'],
    [{ current_step: 6 }, 'Exporter le dossier', '/projects/x/export'],
  ]
  for (const [over, verbe, vers] of cas) {
    const p = projet('x', over)
    assert.equal(verbeEtape(p), verbe)
    assert.equal(lienEtape(p), vers)
    assert.equal(ficheDepuisProjet(p, MAINTENANT).cta?.vers, vers)
  }
  assert.equal(versEtape('x', 99), '/projects/x/export')
  assert.equal(versEtape('x', 0), '/projects/x/upload')
})

test('la fiche dit l’état de la remise : jours, aujourd’hui, date à préciser, date passée', () => {
  const f = (over: Parameters<typeof projet>[1]) => ficheDepuisProjet(projet('x', over), MAINTENANT)
  assert.deepEqual(f(remise('2026-10-28')).statut, { ton: 'attention', texte: 'Remise dans 5 jours' })
  assert.equal(f(remise('2026-10-24')).statut?.texte, 'Remise dans 1 jour')
  assert.equal(f({ echeance: { date: '2026-10-23', heure: '17h00' } }).statut?.texte, 'Remise aujourd’hui')
  assert.deepEqual(f(remise('2026-11-20')).statut, { ton: 'calme', texte: 'Remise dans 28 jours' })
  assert.equal(f({}).statut?.texte, 'Date de remise à préciser')
  assert.equal(f(remise('2026-10-20')).statut?.texte, 'Date de remise passée')
})

test('la date de remise s’écrit « Mercredi 28 octobre, 12 h »', () => {
  assert.equal(quandRemise(projet('x', remise('2026-10-28'))), 'Mercredi 28 octobre, 12 h')
  assert.equal(quandRemise(projet('x', { echeance: { date: '2026-10-28', heure: '14h30' } })), 'Mercredi 28 octobre, 14 h 30')
  assert.equal(quandRemise(projet('x', {})), null)
})

test('la fiche vide propose le premier geste : un nouvel AO', () => {
  const f = ficheVide()
  assert.equal(f.cta?.vers, '/projects/new')
  assert.equal(f.titre, 'Aucun appel d’offres en cours')
})

/** Tous les textes d'une fiche, pour les contrôles de ton. */
export const textesFiche = (f: FicheAction) => [f.etiquette, f.titre, f.meta, f.statut?.texte, f.quand, f.texte, f.cta?.libelle, f.second?.libelle].filter(Boolean) as string[]

test('ton : jamais « manquant / incomplet / absent », jamais de point d’exclamation, jamais de prix ni de conseil de prix', () => {
  const fiches: FicheAction[] = [ficheVide()]
  for (let s = 1; s <= 6; s++) for (const status of ['en_cours', 'analyzed'] as const) {
    for (const over of [{}, remise('2026-10-28'), remise('2026-10-20'), { processing_status: 'processing' }]) {
      fiches.push(ficheDepuisProjet(projet('x', { current_step: s as 1, status, name: 'Bardage du gymnase', ...over }), MAINTENANT))
    }
  }
  const interdits = [/manquant/i, /incompl[eè]t/i, /\babsente?s?\b/i, /!/, /\bprix\b/i, /€|euros?\b/i, /\btarif/i, /\bmontant/i, /\bchiffrage/i, /\bmoins-disant/i]
  for (const f of fiches) for (const t of textesFiche(f)) for (const re of interdits) assert.doesNotMatch(t, re, `« ${t} »`)
})

test('la fiche se rend avec un lien vers l’écran concerné et un second lien vers l’AO', () => {
  const f = ficheDepuisProjet(projet('abc', { ...remise('2026-10-28'), current_step: 6, name: 'Bardage du gymnase', maitre_ouvrage: 'Commune de Valdoie-sur-Mer' }), MAINTENANT)
  const html = renderToStaticMarkup(<MemoryRouter><ProchaineAction fiche={f} /></MemoryRouter>)
  assert.match(html, /<h3[^>]*>Bardage du gymnase<\/h3>/)
  assert.match(html, /href="\/projects\/abc\/export"[^>]*>Exporter le dossier/)
  assert.match(html, /href="\/projects\/abc"[^>]*>Ouvrir l’AO/)
  assert.match(html, /Remise dans 5 jours/)
  assert.match(html, /aria-live="polite"/)
})
