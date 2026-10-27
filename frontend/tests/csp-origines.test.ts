// CSP du front (bloc 6) : la liste des origines autorisées par nginx est celle des origines que le
// code nomme en dur. Si ce test échoue, une nouvelle origine est apparue dans src/ : décider si elle
// charge une ressource (script, image, police, connexion, cadre : à ajouter à la CSP) ou si elle
// n'est qu'un lien que l'on suit (aucune CSP requise), puis compléter ce test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fichiersSource, lire, sansCommentaires } from './outils/sources'

/** Origines littérales du code, avec ce qu'elles font. */
const CONNUES: Record<string, string> = {
  'www.economie.gouv.fr': 'lien <a> vers les formulaires DC1/DC2 : navigation, aucune CSP',
  'maps.googleapis.com': 'image de carte (img-src), seulement si VITE_GOOGLE_MAPS_API_KEY est renseignée (Company.tsx)',
  'www.w3.org': 'espace de noms XML d\'un SVG, jamais chargé',
}

test('toute origine https:// écrite dans src/ est connue de la CSP', () => {
  const trouvees = new Map<string, string>()
  for (const f of fichiersSource()) {
    for (const m of sansCommentaires(lire(f)).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      if (m[1] === 'localhost' || m[1].startsWith('127.')) continue
      trouvees.set(m[1], f)
    }
  }
  const inconnues = [...trouvees].filter(([hote]) => !(hote in CONNUES)).map(([hote, f]) => `${hote} (${f})`)
  assert.deepEqual(inconnues, [], 'origines absentes de la liste de la CSP')
})

test('le front ne charge ni Stripe.js ni police ni script externe : le paiement est une redirection', () => {
  const tout = fichiersSource().map((f) => sansCommentaires(lire(f))).join('\n')
  assert.ok(!/@stripe\/stripe-js|js\.stripe\.com/.test(tout))
  assert.ok(!/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr|unpkg\.com|cdnjs/.test(tout))
  assert.ok(!/document\.createElement\(['"]script['"]\)/.test(tout), 'aucun script injecté à la main (hors Clerk, chargé par son SDK)')
})
