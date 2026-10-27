// Bloc 5 (sujet A) — « Voir dans le DCE » pour un tableur : le tableau HTML accessible, la ligne
// citée surlignée, sans commentaire ni mise en avant des montants. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  TableauSource, celluleCitee, legende, titreColonne,
  type AncreTableur, type FenetreTableur,
} from '@/components/project/source/VueTableau'
import { lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'

const FICHIER = 'src/components/project/source/VueTableau.tsx'

const ancre: AncreTableur = {
  version: 1, format: 'tableur', doc_id: 'd1', feuille: 'Lot 05', ligne: 4, cellules: ['B'], niveau: 'passage',
}

const fenetre: FenetreTableur = {
  feuille: 'Lot 05',
  ligne: 4,
  colonnes: ['A', 'B', 'C', 'D', 'E'],
  entete: { n: 2, cellules: ['N°', 'Désignation', 'Unité', 'Quantité', 'Prix unitaire HT'] },
  lignes: [
    { n: 3, cellules: ['1', 'Échafaudage de pied', 'ens', '1', '4300'], cible: false },
    { n: 4, cellules: ['2', 'Enduit monocouche gratté', 'm2', '240', '38.5'], cible: true },
    { n: 5, cellules: ['3', 'Peinture <b>soubassements</b>', 'm2', '35', ''], cible: false },
  ],
  colonnes_tronquees: false,
}

const html = renderToStaticMarkup(<TableauSource fenetre={fenetre} ancre={ancre} />)

test('un vrai tableau HTML : en-têtes de colonne et de ligne portent leur portée', () => {
  assert.ok(html.includes('<table'))
  assert.ok(html.includes('<caption'))
  assert.equal((html.match(/<th scope="col"/g) ?? []).length, 6)        // « Ligne » + 5 colonnes
  assert.equal((html.match(/<th scope="row"/g) ?? []).length, 3)
  assert.ok(html.includes('>Désignation</th>') && html.includes('>Prix unitaire HT</th>'))
  assert.ok(html.includes('role="region"') && html.includes('tabindex="0"'))   // la zone défile au clavier
})

test('la feuille et la ligne citées sont nommées', () => {
  assert.ok(html.includes('Feuille « Lot 05 »'))
  assert.ok(html.includes("Ligne 4 citée par l&#x27;analyse"))
})

test('une seule ligne est surlignée, annoncée aux lecteurs d\'écran, et ses cellules citées sont marquées', () => {
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1)
  assert.equal((html.match(/data-ligne-citee="true"/g) ?? []).length, 1)
  assert.ok(html.includes('(ligne citée)'))
  assert.equal((html.match(/data-cellule-citee="true"/g) ?? []).length, 1)     // colonne B seulement
  const ligne = html.split('<tr').find((t) => t.includes('aria-current')) ?? ''
  assert.ok(ligne.includes('Enduit monocouche gratté'))
})

test('niveau « page » : la feuille est montrée sans aucun surlignage', () => {
  const sans = renderToStaticMarkup(
    <TableauSource fenetre={{ ...fenetre, ligne: null, lignes: fenetre.lignes.map((l) => ({ ...l, cible: false })) }}
      ancre={{ ...ancre, niveau: 'page', ligne: null, cellules: [] }} />,
  )
  assert.ok(!sans.includes('aria-current') && !sans.includes('data-ligne-citee'))
  assert.ok(sans.includes("Feuille citée par l&#x27;analyse"))
})

test('les valeurs sont du texte : échappées, montants sans mise en forme ni mise en avant', () => {
  assert.ok(html.includes('Peinture &lt;b&gt;soubassements&lt;/b&gt;'))
  assert.ok(html.includes('>4300<') && html.includes('>38.5<'))                // tel que le fichier le donne
  const code = sansCommentaires(lire(FICHIER))
  assert.ok(!/toLocale|Intl\.|NumberFormat|toFixed|parseFloat|reduce\(|€/.test(code), 'aucun calcul ni format monétaire')
  // seule la colonne des numéros de ligne est en police de données ; les cellules (montants compris) restent neutres
  assert.equal((html.match(/edge-data/g) ?? []).length, 3)
})

test('titre de colonne : celui du tableur, sinon la lettre ; cellule citée', () => {
  assert.equal(titreColonne(fenetre, 1), 'Désignation')
  assert.equal(titreColonne({ entete: null, colonnes: ['A', 'B'] }, 1), 'B')
  assert.equal(titreColonne({ entete: { n: 1, cellules: ['', 'x'] }, colonnes: ['A', 'B'] }, 0), 'A')
  assert.ok(celluleCitee(ancre, 'B') && !celluleCitee(ancre, 'C'))
  assert.equal(legende({ niveau: 'passage', ligne: 12 }), "Ligne 12 citée par l'analyse")
  assert.equal(legende({ niveau: 'page', ligne: null }), "Feuille citée par l'analyse")
})

test('téléphone : le défilement horizontal reste dans le tableau, texte de 16 px au moins, cibles de 44 px', () => {
  const code = sansCommentaires(lire(FICHIER))
  assert.ok(code.includes('overflow-auto') && code.includes('max-w-full') && code.includes('min-w-0'))
  assert.ok(!/text-(xs|sm)\b|text-\[(\d|1[0-5])px\]/.test(code), 'aucun texte sous 16 px')
  assert.ok(code.includes('text-base'))
  assert.ok(code.includes('min-h-[44px]') && code.includes('min-w-[44px]'))
  assert.ok(code.includes('h-11'))                                          // lignes de 44 px
  assert.ok(code.includes('motion-reduce:animate-none'))
})

test('textes affichés : positifs, aucun mot interdit', () => {
  const textes = textesAffiches(FICHIER).map((t) => t.texte).join('\n')
  assert.ok(textes.includes('Chargement du tableau'))
  assert.ok(textes.includes('Réessayer'))
  assert.ok(!/manquant|incompl[eè]t|\babsente?s?\b|!/i.test(textes + html.replace(/<[^>]+>/g, ' ')))
})
