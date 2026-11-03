// Phase D, tranche 4 — assemblage : SynorixIntelligence, données de démonstration, route interne /intelligence-demo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculerBulles, ficheAffichee } from '@/lib/intelligence/bulles'
import { MAINTENANT_DEMO, PROJETS_DEMO, STATS_DEMO } from '@/lib/intelligence/demo'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test('les données de démonstration donnent les six bulles de la maquette, sans rien de réel', () => {
  const b = Object.fromEntries(calculerBulles(PROJETS_DEMO, STATS_DEMO, MAINTENANT_DEMO).map((x) => [x.id, x]))
  assert.deepEqual([b.decision.compte, b.remise.compte, b.lot.compte, b.memoire.compte, b.piece.compte, b.expirent.compte], ['1', 'J−5', '1', '1', '1', '2'])
  assert.equal(PROJETS_DEMO.length, 4)
  assert.ok(PROJETS_DEMO.every((p) => p.organization_id === 'org-demo'), 'données inventées, organisation fictive')
})

test('la fiche affichée suit la bulle choisie, puis revient à la prochaine action', () => {
  const bulles = calculerBulles(PROJETS_DEMO, STATS_DEMO, MAINTENANT_DEMO)
  assert.equal(ficheAffichee(null, bulles, PROJETS_DEMO, MAINTENANT_DEMO).titre, 'Bardage du gymnase Jean-Jaurès')
  assert.equal(ficheAffichee('decision', bulles, PROJETS_DEMO, MAINTENANT_DEMO).titre, 'Réhabilitation thermique du groupe scolaire Paul-Bert')
  assert.equal(ficheAffichee('piece', bulles, PROJETS_DEMO, MAINTENANT_DEMO).cta?.vers, '/vault')
  assert.equal(ficheAffichee('inconnue', bulles, PROJETS_DEMO, MAINTENANT_DEMO).etiquette, 'Prochaine action')
  assert.equal(ficheAffichee(null, [], [], MAINTENANT_DEMO).cta?.vers, '/projects/new')
})

test('la page /intelligence-demo est retirée : ni route, ni lien, ni entrée de Ctrl K (décision du 4/11)', () => {
  assert.doesNotMatch(sansCommentaires(lire('src/App.tsx')), /IntelligenceDemo|intelligence-demo/)
  const liens = fichiersSource('src').filter((f) => lire(f).includes('intelligence-demo'))
  assert.deepEqual(liens, [])
})

test('rien dans le composant ne dépend d’un module de menu ou de layout (branchement à la main, tableau de bord intact)', () => {
  for (const f of fichiersSource('src/components/intelligence')) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /components\/(layout|ui)\//, f)
  }
})
