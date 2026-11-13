// FIN-ECR (jury, tour 4, decider-tresorerie-detail) — à 390 px, l'extrait du contrat se coupait entre « 10 » et « % ».
// Un nombre et son signe ne se séparent jamais : `espacesFr` (lib/espacesFr.ts, la même fonction que pour « : ; ? » dans un
// texte venu du serveur) les lie par une espace insécable, et l'extrait cité (`citationAffichee`) passe par elle.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { espacesFr } from '@/lib/espacesFr'
import { citationAffichee } from '@/lib/ancre'
import { Citation } from '@/components/project/source/VuesSource'
import type { ReponseSource } from '@/lib/ancre'

// texte inventé (jamais un extrait de DCE dans le dépôt), de la même forme que l'extrait vu par le jury
const EXTRAIT = 'Variante deux : l’acompte vaut 10 % Ce montant reste un plafond pour l’entreprise'

test('espacesFr : un nombre et son signe (« % », « € ») restent d’un seul tenant', () => {
  assert.equal(espacesFr('fixé à 10 % du montant'), 'fixé à 10 % du montant')
  assert.equal(espacesFr('une avance de 1 200 €'), 'une avance de 1 200 €')
  assert.equal(espacesFr('le taux : 5,5 %'), 'le taux : 5,5 %')
  assert.equal(espacesFr('sans nombre % ici'), 'sans nombre % ici', 'seul un chiffre lie le signe')
})

test('l’extrait cité lie « 10 » et « % », avant, dans et après le passage', () => {
  const c = citationAffichee({ avant: 'retenue de 5 %', passage: EXTRAIT, apres: 'pénalité de 1 € par jour' } as never)
  assert.match(c.passage, /10 % Ce/)
  assert.doesNotMatch(c.passage, /\d %/)
  assert.equal(c.avant, 'retenue de 5 %')
  assert.equal(c.apres, 'pénalité de 1 € par jour')
})

test('le panneau de source affiche l’extrait sans espace sécable entre le nombre et son signe', () => {
  const reponse = { citation: { avant: '', passage: EXTRAIT, apres: '' }, page: 3, niveau: 'aucun', document: { nom: 'CCAP.pdf' } } as unknown as ReponseSource
  const html = renderToStaticMarkup(<Citation reponse={reponse} surligner={false} />)
  assert.match(html, /10 % Ce montant/)
  assert.doesNotMatch(html, /10 %/)
})
