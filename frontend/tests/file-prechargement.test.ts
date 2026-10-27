// File de préchargement des ancres et des loupes : bornée en simultané, en débit par minute
// (sous la limite du serveur : 120 ancres et 300 aperçus par minute et par organisation),
// sans doublon, annulable, en pause sur un refus du serveur. Horloge et réveils simulés.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creerFile, type Categorie } from '@/lib/filePrechargement'

/** Horloge et planificateur simulés ; chaque tâche reste en cours jusqu'à `finir`. */
function banc(options: { simultanees: number; ancre: number; apercu: number; attenteMax?: number }) {
  let t = 1_000_000
  const reveils: { a: number; fn: () => void }[] = []
  const file = creerFile({
    simultanees: options.simultanees,
    parMinute: { ancre: options.ancre, apercu: options.apercu },
    attenteMax: options.attenteMax,
    maintenant: () => t,
    planifier: (fn, ms) => { reveils.push({ a: t + ms, fn }) },
  })
  const lancees: string[] = []
  const finir = new Map<string, () => void>()
  let enMemeTemps = 0
  let maxEnMemeTemps = 0
  const tache = (cle: string, categorie: Categorie) => ({
    cle, categorie,
    executer: () => new Promise<void>((resolve) => {
      lancees.push(cle)
      enMemeTemps += 1
      maxEnMemeTemps = Math.max(maxEnMemeTemps, enMemeTemps)
      finir.set(cle, () => { enMemeTemps -= 1; resolve() })
    }),
  })
  const attendre = () => new Promise((r) => setImmediate(r))
  const avancer = async (ms: number) => {
    t += ms
    for (const r of reveils.splice(0).sort((x, y) => x.a - y.a)) {
      if (r.a <= t) r.fn(); else reveils.push(r)
    }
    await attendre()
  }
  const terminer = async (cle: string) => { await attendre(); finir.get(cle)?.(); await attendre() }
  return { file, tache, lancees, terminer, avancer, attendre, max: () => maxEnMemeTemps }
}

test('jamais plus de requêtes en même temps que la limite', async () => {
  const b = banc({ simultanees: 3, ancre: 100, apercu: 100 })
  for (let i = 0; i < 10; i++) b.file.ajouter(b.tache(`a${i}`, 'ancre'))
  await b.attendre()
  assert.deepEqual(b.lancees, ['a0', 'a1', 'a2'])
  await b.terminer('a0')
  assert.deepEqual(b.lancees, ['a0', 'a1', 'a2', 'a3'])
  for (let i = 1; i < 10; i++) await b.terminer(`a${i}`).catch(() => {})
  assert.ok(b.max() <= 3, `max ${b.max()}`)
})

test('une même tâche n’est lancée qu’une fois (en attente, en cours, faite)', async () => {
  const b = banc({ simultanees: 1, ancre: 100, apercu: 100 })
  b.file.ajouter(b.tache('x', 'ancre'))
  b.file.ajouter(b.tache('x', 'ancre'))
  await b.attendre()
  await b.terminer('x')
  b.file.ajouter(b.tache('x', 'ancre'))
  await b.attendre()
  assert.deepEqual(b.lancees, ['x'])
})

test('budget par minute : au plus N départs par fenêtre de 60 s, la suite attend', async () => {
  const b = banc({ simultanees: 5, ancre: 4, apercu: 100 })
  for (let i = 0; i < 10; i++) b.file.ajouter(b.tache(`a${i}`, 'ancre'))
  await b.attendre()
  for (const c of [...b.lancees]) await b.terminer(c)
  assert.equal(b.lancees.length, 4)                       // budget épuisé
  assert.equal(b.file.etat().attente, 6)
  await b.avancer(30_000)
  assert.equal(b.lancees.length, 4)                       // la minute n'est pas écoulée
  await b.avancer(31_000)
  assert.equal(b.lancees.length, 8)                       // fenêtre suivante : 4 de plus
})

test('les budgets sont par catégorie : les aperçus passent quand le budget des ancres est épuisé', async () => {
  const b = banc({ simultanees: 5, ancre: 1, apercu: 3 })
  b.file.ajouter(b.tache('a0', 'ancre'))
  b.file.ajouter(b.tache('a1', 'ancre'))
  b.file.ajouter(b.tache('p0', 'apercu'))
  b.file.ajouter(b.tache('p1', 'apercu'))
  await b.attendre()
  assert.deepEqual(b.lancees.sort(), ['a0', 'p0', 'p1'])
})

test('un appel fait hors file (clic) est compté dans le budget de la minute', async () => {
  const b = banc({ simultanees: 5, ancre: 2, apercu: 100 })
  b.file.noter('ancre')
  b.file.noter('ancre')
  b.file.ajouter(b.tache('a0', 'ancre'))
  await b.attendre()
  assert.deepEqual(b.lancees, [])
  await b.avancer(61_000)
  assert.deepEqual(b.lancees, ['a0'])
})

test('une exigence sortie de l’écran avant son départ est retirée, et peut être redemandée', async () => {
  const b = banc({ simultanees: 1, ancre: 100, apercu: 100 })
  b.file.ajouter(b.tache('a0', 'ancre'))
  b.file.ajouter(b.tache('a1', 'ancre'))
  assert.equal(b.file.retirer('a1'), true)
  assert.equal(b.file.retirer('a0'), false)               // déjà partie
  b.file.ajouter(b.tache('a1', 'ancre'))
  await b.terminer('a0')
  assert.deepEqual(b.lancees, ['a0', 'a1'])
})

test('la file d’attente est bornée : les plus anciennes sont écartées', async () => {
  const b = banc({ simultanees: 1, ancre: 1000, apercu: 1000, attenteMax: 3 })
  for (let i = 0; i < 8; i++) b.file.ajouter(b.tache(`a${i}`, 'ancre'))
  assert.equal(b.file.etat().attente, 3)
  await b.terminer('a0')
  assert.deepEqual(b.lancees.slice(0, 2), ['a0', 'a5'])
})

test('un refus du serveur (429, 503) met la file en pause le temps demandé', async () => {
  const b = banc({ simultanees: 2, ancre: 100, apercu: 100 })
  b.file.ajouter(b.tache('a0', 'ancre'))
  await b.attendre()
  b.file.pauser(20_000)
  b.file.ajouter(b.tache('a1', 'ancre'))
  await b.terminer('a0')
  assert.deepEqual(b.lancees, ['a0'])
  await b.avancer(10_000)
  assert.deepEqual(b.lancees, ['a0'])
  await b.avancer(11_000)
  assert.deepEqual(b.lancees, ['a0', 'a1'])
})

test('une tâche qui échoue ne bloque pas la file', async () => {
  let t = 0
  const file = creerFile({ simultanees: 1, parMinute: { ancre: 10, apercu: 10 }, maintenant: () => t })
  const faites: string[] = []
  file.ajouter({ cle: 'a0', categorie: 'ancre', executer: async () => { throw new Error('refus') } })
  file.ajouter({ cle: 'a1', categorie: 'ancre', executer: async () => { faites.push('a1') } })
  await new Promise((r) => setTimeout(r, 20))
  t += 1
  assert.deepEqual(faites, ['a1'])
})

test('débit réel : 400 exigences affichées ne dépassent ni 50 ancres ni 120 aperçus dans la minute', async () => {
  // mêmes réglages que services/sources.ts ; le serveur accepte 120 ancres et 300 aperçus par minute
  const b = banc({ simultanees: 3, ancre: 50, apercu: 120, attenteMax: 1000 })
  for (let i = 0; i < 400; i++) {
    b.file.ajouter(b.tache(`a${i}`, 'ancre'))
    b.file.ajouter(b.tache(`p${i}`, 'apercu'))
  }
  const vider = async () => { for (let tour = 0; tour < 400; tour++) { await b.attendre(); for (const c of [...b.lancees]) await b.terminer(c) } }
  await vider()
  const depart = (prefixe: string) => b.lancees.filter((c) => c.startsWith(prefixe)).length
  assert.equal(depart('a'), 50)
  assert.equal(depart('p'), 120)
  assert.ok(b.max() <= 3, `max ${b.max()}`)
  await b.avancer(61_000)
  await vider()
  assert.equal(depart('a'), 100)                              // la minute suivante : encore 50
  assert.equal(depart('p'), 240)
})
