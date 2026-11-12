// Contrôleur d'aperçu des fiches : demande 800 ms après le dernier changement (la dernière gagne), sondage toutes les
// 700 ms tant que le serveur fabrique, états « mise à jour », « indisponible » et « erreur », arrêt au démontage.
// Minuteries simulées : aucune attente réelle, aucun réseau.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ControleurApercu, DEBOUNCE_MS, SONDAGE_MS, SONDAGES_MAX, MESSAGE_INDISPONIBLE, apercuSimplifie, enMiseAJour, urlPage,
  type AccesApercu, type EtatApercu, type FormatFiche, type ReponseDemande, type ReponseEtat,
} from '@/lib/apercuFiche'

const EMP = 'e'.repeat(64)

function faux(demandes: ReponseDemande[], etats: ReponseEtat[] = []) {
  const appels: { genre: 'demander' | 'etat'; format?: FormatFiche; empreinte?: string }[] = []
  const acces: AccesApercu = {
    demander: async (_r, format) => { appels.push({ genre: 'demander', format }); return demandes.shift() ?? { etat: 'pret', empreinte: EMP, pages: 1 } },
    etat: async (_r, empreinte) => { appels.push({ genre: 'etat', empreinte }); return etats.shift() ?? { etat: 'pret', pages: 1, message: '' } },
  }
  return { acces, appels }
}
const vider = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }

test('une demande part 800 ms après le dernier changement : une rafale de changements ne fait qu’une demande, la dernière', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { acces, appels } = faux([{ etat: 'pret', empreinte: EMP, pages: 2 }])
  const c = new ControleurApercu(acces, 'moyens')
  c.planifier('pdf')
  t.mock.timers.tick(500)
  c.planifier('docx')
  t.mock.timers.tick(500)
  c.planifier('xlsx')
  assert.equal(appels.length, 0, 'rien avant 800 ms après le dernier changement')
  assert.equal(c.lire().phase, 'attente')
  t.mock.timers.tick(DEBOUNCE_MS - 1)
  await vider()
  assert.equal(appels.length, 0)
  t.mock.timers.tick(1)
  await vider()
  assert.deepEqual(appels, [{ genre: 'demander', format: 'xlsx' }])
  assert.deepEqual(c.lire(), { phase: 'pret', empreinte: EMP, pages: 2, message: '', empreinteAffichee: EMP })
})

test('changer de format relance l’aperçu après 800 ms, avec l’état « mise à jour » entre-temps', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { acces, appels } = faux([{ etat: 'pret', empreinte: EMP, pages: 1 }, { etat: 'pret', empreinte: 'f'.repeat(64), pages: 3 }])
  const c = new ControleurApercu(acces, 'moyens')
  const vus: string[] = []
  c.abonner((e) => vus.push(e.phase))
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.equal(c.lire().phase, 'pret')
  c.planifier('docx')                                   // l'utilisateur choisit Word
  assert.equal(enMiseAJour(c.lire()), true, 'dès le choix, l’aperçu est « en mise à jour »')
  assert.equal(c.lire().empreinteAffichee, EMP, 'les anciennes pages restent affichées')
  t.mock.timers.tick(DEBOUNCE_MS)
  await vider()
  assert.deepEqual(appels.map((a) => a.format), ['pdf', 'docx'])
  assert.equal(c.lire().empreinteAffichee, 'f'.repeat(64))
  assert.equal(c.lire().pages, 3)
  assert.deepEqual(vus, ['attente', 'maj', 'pret', 'attente', 'maj', 'pret'])
})

test('202 « en cours » : sondage toutes les 700 ms jusqu’à « prêt », pages affichées seulement à ce moment', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { acces, appels } = faux([{ etat: 'en_cours', empreinte: EMP }], [
    { etat: 'en_cours', pages: 0, message: '' }, { etat: 'en_cours', pages: 0, message: '' }, { etat: 'pret', pages: 4, message: '' },
  ])
  const c = new ControleurApercu(acces, 'certifications')
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.equal(c.lire().phase, 'maj')
  assert.equal(c.lire().empreinteAffichee, null)
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(SONDAGE_MS - 1)
    await vider()
    assert.equal(appels.filter((a) => a.genre === 'etat').length, i, 'pas de sondage avant 700 ms')
    t.mock.timers.tick(1)
    await vider()
    assert.equal(appels.filter((a) => a.genre === 'etat').length, i + 1)
  }
  assert.deepEqual(c.lire(), { phase: 'pret', empreinte: EMP, pages: 4, message: '', empreinteAffichee: EMP })
  t.mock.timers.tick(10 * SONDAGE_MS)
  await vider()
  assert.equal(appels.filter((a) => a.genre === 'etat').length, 3, 'le sondage s’arrête dès que l’aperçu est prêt')
})

test('la dernière demande gagne : la réponse d’une demande dépassée est ignorée', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let rendre!: (r: ReponseDemande) => void
  const acces: AccesApercu = {
    demander: (_r, format) => format === 'pdf' ? new Promise((ok) => { rendre = ok }) : Promise.resolve({ etat: 'pret', empreinte: 'b'.repeat(64), pages: 1 }),
    etat: async () => ({ etat: 'pret', pages: 1, message: '' }),
  }
  const c = new ControleurApercu(acces, 'moyens')
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()                                          // la demande PDF est en vol
  c.planifier('docx', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.equal(c.lire().empreinteAffichee, 'b'.repeat(64))
  rendre({ etat: 'pret', empreinte: 'a'.repeat(64), pages: 9 })   // la réponse tardive du PDF
  await vider()
  assert.equal(c.lire().empreinteAffichee, 'b'.repeat(64), 'la réponse dépassée ne remplace rien')
  assert.equal(c.lire().pages, 1)
})

test('LibreOffice indisponible : état « indisponible » avec la ligne d’explication, aperçu simplifié', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { acces } = faux([{ etat: 'indisponible', empreinte: EMP, message: MESSAGE_INDISPONIBLE }])
  const c = new ControleurApercu(acces, 'moyens')
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.equal(c.lire().phase, 'indisponible')
  assert.equal(c.lire().message, 'Aperçu simplifié : le rendu exact est indisponible pour le moment.')
  assert.equal(apercuSimplifie(c.lire()), true)
  assert.equal(enMiseAJour(c.lire()), false)
})

test('erreur de fabrication ou réseau en panne : état « erreur » (aperçu simplifié), jamais de sondage sans fin', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const a = faux([{ etat: 'en_cours', empreinte: EMP }], [{ etat: 'erreur', pages: 0, message: 'La conversion en PDF prend plus de temps que prévu.' }])
  const c = new ControleurApercu(a.acces, 'moyens')
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  t.mock.timers.tick(SONDAGE_MS)
  await vider()
  assert.equal(c.lire().phase, 'erreur')
  assert.match(c.lire().message, /plus de temps que prévu/)
  assert.equal(apercuSimplifie(c.lire()), true)
  // réseau en panne
  const panne = new ControleurApercu({ demander: async () => { throw new Error('réseau') }, etat: async () => { throw new Error('réseau') } }, 'moyens')
  panne.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.equal(panne.lire().phase, 'erreur')
  // un serveur qui répond « en cours » sans fin : borné
  const sans = new ControleurApercu({
    demander: async () => ({ etat: 'en_cours', empreinte: EMP }), etat: async () => ({ etat: 'en_cours', pages: 0, message: '' }),
  }, 'moyens')
  sans.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  for (let i = 0; i < SONDAGES_MAX + 2; i++) { t.mock.timers.tick(SONDAGE_MS); await vider() }
  assert.equal(sans.lire().phase, 'erreur')
  assert.match(sans.lire().message, /tarde/)
})

test('au démontage : plus de minuterie, plus de sondage, plus de notification', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const a = faux([{ etat: 'en_cours', empreinte: EMP }])
  const c = new ControleurApercu(a.acces, 'moyens')
  const vus: EtatApercu[] = []
  c.abonner((e) => vus.push(e))
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  const avant = vus.length
  c.arreter()
  t.mock.timers.tick(20 * SONDAGE_MS)
  await vider()
  assert.equal(a.appels.filter((x) => x.genre === 'etat').length, 0, 'aucun sondage après l’arrêt')
  assert.equal(vus.length, avant)
  c.planifier('docx', 0)                                  // après l'arrêt : sans effet
  t.mock.timers.tick(DEBOUNCE_MS)
  await vider()
  assert.equal(a.appels.filter((x) => x.genre === 'demander').length, 1)
})

test('adresse d’une page', () => {
  assert.equal(urlPage('moyens', EMP, 2), `/entreprise/fiches/moyens/apercu/${EMP}/pages/2`)
})

test('React rejoue les effets au démarrage (mode développement) : après un arrêt puis une reprise, l’aperçu part', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { acces, appels } = faux([{ etat: 'pret', empreinte: EMP, pages: 1 }])
  const c = new ControleurApercu(acces, 'moyens')
  c.arreter()
  c.reprendre()
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.deepEqual(appels, [{ genre: 'demander', format: 'pdf' }])
  assert.equal(c.lire().phase, 'pret')
})

test('un contrôleur arrêté et non repris ne demande rien', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { acces, appels } = faux([])
  const c = new ControleurApercu(acces, 'moyens')
  c.arreter()
  c.planifier('pdf', 0)
  t.mock.timers.tick(0)
  await vider()
  assert.equal(appels.length, 0)
})
