// FIN-ECR — décision D26 du fondateur : l'article 11 des CGV suit les offres actuelles (Essentiel, Pro, Business : les mêmes
// fonctions, seul le quota change). L'engagement de moyens (99 % en moyenne mensuelle) vaut pour les trois offres, sans nommer
// d'offre qui n'existe pas ; aucun SLA contractuel ni indemnité n'existe. Aucune autre page juridique ne renvoie à un SLA.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { RACINE } from './outils/sources'

const legal = (slug: string) => readFileSync(path.join(RACINE, 'public/legal', `${slug}.md`), 'utf8')

test('CGV, article 11 : « Disponibilité du Service », 99 % pour toutes les offres, sans SLA ni indemnité', () => {
  const cgv = legal('cgv')
  const art11 = cgv.slice(cgv.indexOf('## 11.'), cgv.indexOf('## 12.'))
  assert.match(art11, /^## 11\. Disponibilité du Service\n/)
  assert.match(art11, /disponibilité du Service supérieure à \*\*99 %\*\* en moyenne mensuelle,\nquelle que soit l'offre souscrite\./)
  assert.match(art11, /maintenance planifiée et les cas de force majeure\nsont exclus du calcul de disponibilité\./)
  assert.doesNotMatch(art11, /SLA|Service Level|99,5|indemnit|crédit|Starter|Essentiel|Pro\b|Business|contrat de service/)
  assert.match(cgv, /\*\*Dernière mise à jour : 13 novembre 2026\*\*/)
})

test('aucune page juridique ne renvoie à un SLA, à une indemnité de disponibilité ni à l’offre « Starter »', () => {
  for (const slug of ['cgv', 'cgu', 'politique-confidentialite', 'mentions-legales', 'cookies']) {
    assert.doesNotMatch(legal(slug), /\bSLA\b|Service Level Agreement|Starter|99,5\s?%|indemnité par crédit/, slug)
  }
})
