// 1.2 — L'essai gratuit n'est plus bloqué par l'écran : c'est le serveur qui
// applique le quota, et seul son refus (402) ouvre le choix d'une offre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

test("aucun écran ne bloque le plan gratuit avant d'avoir interrogé le serveur", () => {
  for (const f of fichiersSource()) {
    const code = sansCommentaires(lire(f))
    assert.doesNotMatch(code, /plan\s*===\s*'free'\)\s*\{\s*setShowPaywall\(true\)/, f)
  }
})

test("le mur d'abonnement ne s'ouvre que sur un refus 402 du serveur, avec son message", () => {
  // le geste « Lire ce dossier » (écran Lots et carte « un seul lot » du dépôt) vit dans useLancerLecture
  for (const f of ['src/hooks/useLancerLecture.ts', 'src/routes/project/StepMemoire.tsx']) {
    const code = sansCommentaires(lire(f))
    const ouvertures = [...code.matchAll(/setShowPaywall\(true\)/g)]
    assert.ok(ouvertures.length > 0, f)
    for (const o of ouvertures) {
      const avant = code.slice(Math.max(0, o.index! - 250), o.index)
      assert.match(avant, /status === 402/, `${f} : ouverture du mur hors d'un refus 402`)
    }
    if (f.includes('StepMemoire')) assert.match(code, /<SubscriptionWall[^\n]*message=\{paywallMessage\}/, f)
  }
})

test("la grille des offres de la lecture reçoit le message du serveur", () => {
  assert.match(sansCommentaires(lire('src/components/project/EcransLecture.tsx')), /<SubscriptionWall[^\n]*message=\{lecture\.paywallMessage\}/)
})
