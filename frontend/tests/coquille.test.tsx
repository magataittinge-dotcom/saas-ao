// La coquille (mission SOCLE § 4) : le rond du compte, le choix du thème et « Animer le fond » dans le menu du compte,
// la barre du haut (56 px et deux actions au téléphone, un seul aplat d'accent), le bandeau « Nouveau » hors coquille.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { RondCompte } from '@/components/layout/MenuCompte'
import { OPTIONS_THEME } from '@/components/layout/BasculeTheme'
import { initialeDuPrenom } from '@/lib/raisonSociale'
import { prenomAffichable } from '@/lib/prenom'
import { choixTheme } from '@/lib/theme'
import { lire, sansCommentaires } from './outils/sources'

test('rond du compte : l\'initiale du prénom, sinon une icône de personne ; jamais un tiret, jamais l\'e-mail', () => {
  const avec = renderToStaticMarkup(<RondCompte initiale={initialeDuPrenom(prenomAffichable('Mohamed O.', 'm@x.fr'))} />)
  assert.match(avec, /<span data-initiale="">M<\/span>/)
  const sans = renderToStaticMarkup(<RondCompte initiale={initialeDuPrenom(prenomAffichable('maga.taittinge', 'maga.taittinge@gmail.com'))} />)
  assert.match(sans, /<svg[^>]*data-rond-icone/)
  assert.doesNotMatch(sans, /[—–-]<|maga|>m</i)
  assert.match(renderToStaticMarkup(<RondCompte photo="https://exemple.test/p.png" initiale="M" />), /<img src="https:\/\/exemple\.test\/p\.png" alt=""/)
})

test('thème : « Système · Clair · Nuit » dans le menu du compte ; sans choix enregistré, c\'est « Système »', () => {
  assert.deepEqual(OPTIONS_THEME.map((o) => [o.valeur, o.libelle]), [['system', 'Système'], ['light', 'Clair'], ['dark', 'Nuit']])
  assert.equal(choixTheme(), 'system') // aucun localStorage ici : aucun choix enregistré
  const menu = sansCommentaires(lire('src/components/layout/MenuCompte.tsx'))
  assert.match(menu, /<Menu\.RadioGroup value=\{choix\}/)
  assert.match(menu, /Animer le fond/)
  const theme = sansCommentaires(lire('src/lib/theme.ts'))
  assert.match(theme, /localStorage\.removeItem\(CLE_THEME\)/, '« Système » efface le choix enregistré')
  // le réglage est lu par l'aurore, en plus de prefers-reduced-motion
  const aurore = sansCommentaires(lire('src/components/layout/Aurore.tsx'))
  assert.match(aurore, /useUIStore\(\(s\) => s\.animerFond\)/)
  assert.match(aurore, /data-arretee=\{arretee \|\| !animerFond \? '' : undefined\}/)
  assert.match(sansCommentaires(lire('src/stores/uiStore.ts')), /partialize: \(s\) => \(\{ sidebarCollapsed: s\.sidebarCollapsed, animerFond: s\.animerFond \}\)/)
})

test('barre du haut : 56 px au téléphone, deux actions (recherche et « + »), « Nouvel appel d\'offres » au trait dès que l\'écran a son action', () => {
  const entete = sansCommentaires(lire('src/components/layout/Header.tsx'))
  assert.match(entete, /className="conteneur flex h-14 /)
  assert.match(entete, /<span className="max-\[768px\]:hidden"><NotificationBell \/><\/span>/)
  assert.doesNotMatch(entete, /BasculeTheme/)
  assert.match(entete, /const auTrait = aplatsEcran > 0/)
  assert.doesNotMatch(entete, /hover:-translate-y/, 'au survol rien ne bouge (P17)')
  assert.match(entete, /active:scale-\[\.98\]/)
  assert.doesNotMatch(sansCommentaires(lire('src/components/layout/Layout.tsx')), /BandeauNouveau/)
})
