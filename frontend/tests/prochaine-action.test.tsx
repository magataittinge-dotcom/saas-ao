// Prochaine action d'un AO : UN calcul (lib/intelligence/action.ts, sans IA) pour l'accueil, Mes AO, la bande « Vos AO en cours »,
// la palette Ctrl K et le Compagnon. « Lancer l'analyse » est devenu « Lire ce dossier » partout. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionEtape, aMemoire, lienEtape, verbeEtape } from '@/lib/intelligence/action'
import { prochaineEtape } from '@/components/dashboard/BandeAO'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'
import type { Project } from '@/types'

const projet = (over: Partial<Project> = {}): Project => ({
  id: 'p', organization_id: 'o', name: 'AO inventé', status: 'en_cours', current_step: 1, completed_steps: {},
  created_at: '2026-10-01T00:00:00', updated_at: '2026-10-01T00:00:00', ...over,
} as Project)

test('chaque état de l’AO a son verbe et son écran, jusqu’à l’étape 5 du serveur', () => {
  const cas: [Partial<Project>, string, string][] = [
    [{ current_step: 1 }, 'Déposer le dossier de l’acheteur'.replace('’', "'"), 'upload'],
    [{ current_step: 2 }, 'Choisir le lot', 'lots'],
    [{ current_step: 3 }, 'Lire ce dossier', 'analysis'],
    [{ current_step: 3, processing_status: 'processing' }, 'Analyse en cours', 'analysis'],
    [{ current_step: 3, status: 'analyzed' }, 'Décider : on y va ?', 'analysis'],
    [{ current_step: 4, status: 'analyzed', completed_steps: { 3: true } }, 'Vérifier le dossier', 'verification'],
    // étape 5 : le plan d'abord, la rédaction ensuite
    [{ current_step: 5, status: 'analyzed', completed_steps: { 3: true, 4: true } }, 'Préparer le plan du mémoire', 'plan'],
    [{ current_step: 5, processing_status: 'generating' }, 'Rédaction du mémoire en cours', 'memoire'],
    [{ current_step: 5, completed_steps: { 3: true, 4: true, 5: true } }, 'Relire le mémoire', 'memoire'],
    [{ current_step: 6, completed_steps: { 5: true } }, 'Exporter le dossier', 'export'],
  ]
  for (const [over, verbe, segment] of cas) {
    const p = projet(over)
    assert.deepEqual(actionEtape(p), { verbe, segment }, JSON.stringify(over))
    assert.equal(verbeEtape(p), verbe)
    assert.equal(lienEtape(p), `/projects/p/${segment}`)
    assert.equal(prochaineEtape(p), verbe, 'la bande « Vos AO en cours » utilise le même calcul')
  }
  assert.equal(aMemoire(projet({ completed_steps: { 5: true } })), true)
  assert.equal(aMemoire(projet()), false)
})

test('« Lancer l’analyse » n’existe plus : c’est « Lire ce dossier » partout où c’est la même action', () => {
  const restes = fichiersSource().flatMap((f) => textesAffiches(f).filter((t) => /\blancer l['’]analyse/i.test(t.texte)).map((t) => `${t.fichier}:${t.ligne}`))
  assert.deepEqual(restes, [])
})

test('l’accueil, Mes AO et la palette ouvrent l’écran de la prochaine action, pas toujours le dépôt', () => {
  const bande = sansCommentaires(lire('src/components/dashboard/BandeAO.tsx'))
  assert.equal((bande.match(/lienEtape\(p\)/g) ?? []).length, 1, 'un bouton par AO, au verbe de sa prochaine action')
  for (const f of ['src/components/mesao/LigneAO.tsx', 'src/components/mesao/ALaUne.tsx']) {
    const code = sansCommentaires(lire(f))
    assert.equal((code.match(/to=\{lienEtape\(projet\)\}/g) ?? []).length, 1, `${f} : le bouton de la prochaine action`)
  }
  const projetEcran = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.match(projetEcran, /<Navigate to=\{actionEtape\(project\)\.segment\} replace \/>/, '/projects/<id> (palette, veille) ouvre la prochaine action')
})
