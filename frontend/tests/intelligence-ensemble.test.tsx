// Phase D, tranche 4 — assemblage : SynorixIntelligence, données de démonstration, route interne /intelligence-demo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import SynorixIntelligence from '@/components/intelligence/SynorixIntelligence'
import { calculerBulles, ficheAffichee } from '@/lib/intelligence/bulles'
import { MAINTENANT_DEMO, PROJETS_DEMO, STATS_DEMO } from '@/lib/intelligence/demo'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

const rendre = (props: Partial<Parameters<typeof SynorixIntelligence>[0]> = {}) => renderToStaticMarkup(
  <MemoryRouter><SynorixIntelligence projects={PROJETS_DEMO} stats={STATS_DEMO} prenom="Mohamed" maintenant={MAINTENANT_DEMO} {...props} /></MemoryRouter>)

test('les données de démonstration donnent les six bulles de la maquette, sans rien de réel', () => {
  const b = Object.fromEntries(calculerBulles(PROJETS_DEMO, STATS_DEMO, MAINTENANT_DEMO).map((x) => [x.id, x]))
  assert.deepEqual([b.decision.compte, b.remise.compte, b.lot.compte, b.memoire.compte, b.piece.compte, b.expirent.compte], ['1', 'J−5', '1', '1', '1', '2'])
  assert.equal(PROJETS_DEMO.length, 4)
  assert.ok(PROJETS_DEMO.every((p) => p.organization_id === 'org-demo'), 'données inventées, organisation fictive')
})

test('l’assemblage : titre, visage (poster + deux canvas), six bulles, fiche « prochaine action »', () => {
  const html = rendre()
  assert.match(html, /<h2[^>]*>Synorix Intelligence<\/h2>/)
  assert.match(html, /<strong>Bonjour Mohamed<\/strong> · vendredi 23 octobre\./)
  assert.match(html, /src="\/visage\/tete-ouverte-poster\.webp"/)
  assert.match(html, /src="\/visage\/tete-fermee-poster\.webp"/)
  assert.equal((html.match(/<canvas/g) ?? []).length, 2)
  assert.equal((html.match(/data-bulle="/g) ?? []).length, 6)
  assert.match(html, /data-mode="poster"/, 'rendu serveur : le poster d’abord')
  assert.match(html, /<h3[^>]*>Bardage du gymnase Jean-Jaurès<\/h3>/)
  assert.match(html, /Prochaine action/)
  // le visage est décoratif : caché aux lecteurs d'écran, le sens passe par les bulles et la fiche
  assert.match(html, /class="syx-scene"[^>]*aria-hidden="true"/)
})

test('sans AO ni pièce : la fiche propose un nouvel AO, les six bulles restent', () => {
  const html = rendre({ projects: [], stats: null })
  assert.match(html, /Aucun appel d’offres en cours/)
  assert.match(html, /href="\/projects\/new"[^>]*>Nouvel AO/)
  assert.equal((html.match(/data-vide="oui"/g) ?? []).length, 6)
})

test('le prénom est facultatif ; le niveau du titre aussi', () => {
  assert.doesNotMatch(rendre({ prenom: undefined }), /Bonjour/)
  assert.match(rendre({ niveauTitre: 1 }), /<h1[^>]*>Synorix Intelligence<\/h1>/)
})

test('la fiche affichée suit la bulle choisie, puis revient à la prochaine action', () => {
  const bulles = calculerBulles(PROJETS_DEMO, STATS_DEMO, MAINTENANT_DEMO)
  assert.equal(ficheAffichee(null, bulles, PROJETS_DEMO, MAINTENANT_DEMO).titre, 'Bardage du gymnase Jean-Jaurès')
  assert.equal(ficheAffichee('decision', bulles, PROJETS_DEMO, MAINTENANT_DEMO).titre, 'Réhabilitation thermique du groupe scolaire Paul-Bert')
  assert.equal(ficheAffichee('piece', bulles, PROJETS_DEMO, MAINTENANT_DEMO).cta?.vers, '/vault')
  assert.equal(ficheAffichee('inconnue', bulles, PROJETS_DEMO, MAINTENANT_DEMO).etiquette, 'Prochaine action')
  assert.equal(ficheAffichee(null, [], [], MAINTENANT_DEMO).cta?.vers, '/projects/new')
})

test('la route /intelligence-demo est interne : en lazy, derrière la connexion, non liée au menu', () => {
  const app = sansCommentaires(lire('src/App.tsx'))
  assert.match(app, /const IntelligenceDemo = lazy\(\(\) => import\('@\/routes\/IntelligenceDemo'\)\)/)
  assert.match(app, /<Route path="\/intelligence-demo" element=\{<PrivateRoute><IntelligenceDemo \/><\/PrivateRoute>\} \/>/)
  const liens = fichiersSource('src').filter((f) => !/App\.tsx$|IntelligenceDemo\.tsx$|intelligence\/demo\.ts$/.test(f)).filter((f) => lire(f).includes('intelligence-demo'))
  assert.deepEqual(liens, [], 'aucun lien vers la démonstration')
})

test('rien dans le composant ne dépend d’un module de menu ou de layout (branchement à la main, tableau de bord intact)', () => {
  for (const f of fichiersSource('src/components/intelligence')) {
    assert.doesNotMatch(sansCommentaires(lire(f)), /components\/(layout|ui)\//, f)
  }
})
