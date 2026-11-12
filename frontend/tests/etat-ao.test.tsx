// La fonction d'état unique d'un AO (défauts 1 et 2 du fondateur, A5) : lib/etatAO.ts. Tous les écrans l'appellent : l'état
// (« en cours », « à mettre à jour », « terminé »), le verbe d'action et son écran, la phrase de résumé, les faits, les comptes
// d'une liste, « À la une ». Et le dialogue « Mettre à jour le statut », qui existe pour de vrai.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aLaUne, choixStatut, comptesAO, etatAO, faitPieces, lectureAO, STATUTS_SERVEUR } from '@/lib/etatAO'
import type { Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const MAINTENANT = new Date(2026, 10, 10, 9, 0, 0)
const ao = (p: Partial<Project>): Project => ({
  id: 'a', organization_id: 'o', name: 'Salle des fêtes', status: 'en_cours', current_step: 4, created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00',
  ...p,
} as Project)

test('trois états : en cours ; remise passée sans statut mis à jour = à mettre à jour ; déposé, gagné, perdu, sans suite = terminé', () => {
  assert.equal(etatAO(ao({ echeance: { date: '2026-11-20', heure: '12h00' } }), MAINTENANT), 'en_cours')
  assert.equal(etatAO(ao({ echeance: null }), MAINTENANT), 'en_cours', 'sans date : en cours')
  assert.equal(etatAO(ao({ echeance: { date: '2026-04-10', heure: '14h00' } }), MAINTENANT), 'a_mettre_a_jour')
  assert.equal(etatAO(ao({ status: 'brouillon', echeance: { date: '2026-11-09', heure: null } }), MAINTENANT), 'a_mettre_a_jour')
  for (const status of ['soumis', 'gagné', 'perdu', 'sans_suite'] as const) assert.equal(etatAO(ao({ status, echeance: { date: '2026-04-10', heure: null } }), MAINTENANT), 'termine', status)
})

test('remise passée : la seule action est « Mettre à jour le statut » ; jamais « Exporter », jamais « Télécharger »', () => {
  const l = lectureAO(ao({ current_step: 6, completed_steps: { 5: true }, echeance: { date: '2026-04-10', heure: '14h00' } }), MAINTENANT)
  assert.equal(l.etat, 'a_mettre_a_jour')
  assert.equal(l.libelle, 'À mettre à jour')
  assert.deepEqual(l.action, { verbe: 'Mettre à jour le statut', segment: null, statut: true })
  assert.doesNotMatch(`${l.action.verbe} ${l.phrase}`, /[Ee]xporter|[Tt]élécharger|Toutes les étapes/)
  assert.match(l.phrase, /date de remise est passée/)
})

test('un seul vocabulaire : étape Pièces = « Réunir les pièces », étape Export = « Télécharger le dossier »', () => {
  const futur = { date: '2026-11-20', heure: '12h00' }
  assert.equal(lectureAO(ao({ current_step: 4, echeance: futur }), MAINTENANT).action.verbe, 'Réunir les pièces')
  const exp = lectureAO(ao({ current_step: 6, completed_steps: { 5: true }, echeance: futur }), MAINTENANT)
  assert.deepEqual(exp.action, { verbe: 'Télécharger le dossier', segment: 'export', statut: false })
  const sources = ['src/lib/etatAO.ts', 'src/lib/intelligence/action.ts'].map((f) => sansCommentaires(lire(f))).join('\n')
  assert.doesNotMatch(sources, /'Exporter le dossier'|'Vérifier le dossier'/)
})

test('la phrase et les faits viennent de la même source : jamais « Toutes les étapes sont faites » à côté de pièces à joindre', () => {
  const futur = { date: '2026-11-20', heure: '12h00' }
  const base = { current_step: 6 as const, completed_steps: { 5: true }, echeance: futur }
  const reste = lectureAO(ao({ ...base, avancement: { unites: { analyses: 1, memoires: 1 }, pieces: { total: 15, pretes: 0 }, plan_valide_le: null, memoire_ecrit_le: '2026-11-02' } }), MAINTENANT)
  assert.match(reste.phrase, /15 pièces restent à joindre/)
  assert.doesNotMatch(reste.phrase, /Toutes les étapes sont faites/)
  const une = lectureAO(ao({ ...base, avancement: { unites: { analyses: 1, memoires: 1 }, pieces: { total: 15, pretes: 14 }, plan_valide_le: null, memoire_ecrit_le: null } }), MAINTENANT)
  assert.match(une.phrase, /1 pièce reste à joindre/)
  const pret = lectureAO(ao({ ...base, avancement: { unites: { analyses: 1, memoires: 1 }, pieces: { total: 9, pretes: 9 }, plan_valide_le: null, memoire_ecrit_le: null } }), MAINTENANT)
  assert.match(pret.phrase, /Le dossier est prêt/)
  // accords en nombre
  assert.equal(faitPieces({ total: 15, pretes: 1 })?.valeur, '1 sur 15 prête')
  assert.equal(faitPieces({ total: 15, pretes: 3 })?.valeur, '3 sur 15 prêtes')
  assert.equal(faitPieces({ total: 15, pretes: 0 })?.valeur, '15 à joindre')
  assert.equal(faitPieces({ total: 1, pretes: 0 })?.valeur, '1 à joindre')
  assert.equal(faitPieces({ total: 9, pretes: 9 })?.valeur, '9 sur 9 prêtes')
  assert.equal(faitPieces({ total: 0, pretes: 0 }), null)
  assert.equal(faitPieces(null), null)
})

test('les comptes d\'une liste : un AO dont la remise est passée ne compte plus « en cours »', () => {
  const liste = [
    ao({ id: 'a', echeance: { date: '2026-11-12', heure: '12h00' } }),
    ao({ id: 'b', echeance: { date: '2026-12-20', heure: null } }),
    ao({ id: 'c', echeance: { date: '2026-04-10', heure: '14h00' } }),
    ao({ id: 'd', status: 'soumis' }),
    ao({ id: 'e', status: 'gagné' }),
  ]
  const c = comptesAO(liste, MAINTENANT)
  assert.deepEqual([c.enCours, c.aMettreAJour, c.termines, c.total], [2, 1, 2, 5])
  assert.equal(c.remises7, 1)
  assert.equal(c.enAttenteDeResultat, 1)
})

test('« À la une » = la prochaine remise à venir ; aucune à venir : pas de bloc', () => {
  const proche = ao({ id: 'a', echeance: { date: '2026-11-12', heure: '12h00' } })
  const loin = ao({ id: 'b', echeance: { date: '2026-12-20', heure: null } })
  const passee = ao({ id: 'c', echeance: { date: '2026-04-10', heure: '14h00' } })
  const sansDate = ao({ id: 'd', echeance: null })
  assert.equal(aLaUne([loin, passee, proche, sansDate], MAINTENANT)?.id, 'a')
  assert.equal(aLaUne([passee, sansDate, ao({ id: 'e', status: 'soumis', echeance: { date: '2026-11-12', heure: null } })], MAINTENANT), null)
  assert.equal(aLaUne([], MAINTENANT), null)
})

test('« Mettre à jour le statut » : les choix suivent ce que le serveur accepte, et chaque choix se défait quand le serveur le permet', () => {
  assert.deepEqual(choixStatut('en_cours').map((c) => [c.statut, c.libelle]), [['soumis', 'Je l’ai déposé'], ['sans_suite', 'Je n’ai pas répondu']])
  assert.deepEqual(choixStatut('analyzed').map((c) => c.statut), ['soumis', 'sans_suite'])
  assert.deepEqual(choixStatut('soumis').map((c) => [c.statut, c.libelle]), [['gagné', 'Gagné'], ['perdu', 'Perdu'], ['en_cours', 'Je ne l’ai finalement pas déposé']])
  assert.deepEqual(choixStatut('sans_suite').map((c) => c.statut), ['en_cours'])
  // D16 (12/11/2026) : un résultat se corrige (Gagné ↔ Perdu) ou revient à « Déposé » ; le serveur l'accepte (SERVEUR-1)
  assert.deepEqual(choixStatut('gagné').map((c) => [c.statut, c.libelle]), [['perdu', 'Corriger : Perdu'], ['soumis', 'Revenir à Déposé']])
  assert.deepEqual(choixStatut('perdu').map((c) => [c.statut, c.libelle]), [['gagné', 'Corriger : Gagné'], ['soumis', 'Revenir à Déposé']])
  // chaque choix est une transition que le serveur accepte (backend/routers/projects.py, _STATUS_TRANSITIONS)
  const serveur = lire('../backend/routers/projects.py')
  for (const [de, vers] of Object.entries(STATUTS_SERVEUR)) {
    const ligne = serveur.match(new RegExp(`"${de}":\\s*(\\{[^}]*\\}|set\\(\\))`))?.[1] ?? ''
    for (const v of vers) assert.ok(ligne.includes(`"${v}"`), `${de} → ${v} refusé par le serveur`)
  }
  for (const de of Object.keys(STATUTS_SERVEUR)) for (const c of choixStatut(de as Project['status'])) assert.ok(STATUTS_SERVEUR[de].includes(c.statut), `${de} → ${c.statut}`)
  // « Je l'ai déposé » et « Je n'ai pas répondu » se défont
  assert.ok(choixStatut('soumis').some((c) => c.statut === 'en_cours'))
  assert.ok(choixStatut('sans_suite').some((c) => c.statut === 'en_cours'))
  const dialogue = sansCommentaires(lire('src/components/common/MettreAJourStatut.tsx'))
  // D16 : plus rien n'est « définitif » à l'écran, le dialogue ne dit plus qu'un résultat « ne se modifie plus »
  assert.doesNotMatch(dialogue, /définitif|ne se modifie plus/)
  assert.doesNotMatch(sansCommentaires(lire('src/lib/etatAO.ts')), /choixDefinitif/)
  assert.match(dialogue, /<Dialogue /)
  assert.match(dialogue, /api\.patch\(`\/projects\/\$\{projet\.id\}`, \{ status \}\)/)
  assert.match(dialogue, /titre="Mettre à jour le statut"/)
})

test('la coquille appelle la fonction d\'état : pastille de la barre, palette Ctrl K, page d\'un AO', () => {
  for (const f of ['src/components/layout/useUrgents.ts', 'src/components/layout/CommandPalette.tsx', 'src/routes/Project.tsx']) {
    const code = sansCommentaires(lire(f))
    assert.match(code, /from '@\/lib\/etatAO'/, f)
    assert.doesNotMatch(code, /\bestEnCours(Ouvert)?\b/, f)
  }
})
