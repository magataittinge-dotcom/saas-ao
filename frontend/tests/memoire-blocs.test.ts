// Jury, tour 1 (b2, éditeur noté 9) — l'éditeur montrait « # », « ## » et « ** ». Il montre maintenant le texte mis en forme,
// découpé en blocs qui désignent les lignes du texte enregistré. Garanties vérifiées ici, sur des textes inventés :
// ouvrir puis enregistrer sans rien changer rend le texte au caractère près ; une correction ne touche que son bloc ;
// une zone de saisie non touchée rend son texte signe pour signe ; aucun signe n'est écrit dans ce que l'écran montre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assembler, cellulesLigneTable, decouper, ecrireFragments, htmlFragments, libelleACompleter, lireFragments, morceauxLigneTable,
  remplacerBloc, remplacerCellule, texteDeLaSaisie, type NoeudLu,
} from '@/lib/memoireBlocs'
import { depuisMarkdown, titresEditeur, versMarkdown } from '@/lib/memoireMarkdown'
import type { MemoireContent } from '@/types'
import { lire, sansCommentaires } from './outils/sources'

const TEXTES = [
  '# PRÉAMBULE\n\nL’entreprise **Maçonnerie Dupré** remet son offre.\n\n---\n\n# PARTIE A\n\n## 1. Moyens\n\n### Encadrement\n\nUn conducteur de travaux, *présent chaque jour*.\n\n- un chef d’équipe\n- **deux** compagnons\n  - dont un apprenti\n\n1. Installation\n2. Gros œuvre\n',
  '| Poste | Nom | Années |\n|---|:---:|---:|\n| Conducteur | [À COMPLÉTER PAR L\'ENTREPRISE : nom du conducteur] | 12 |\n| Chef d’équipe | **M. Petit** | 8 |\n\nSiège : [À COMPLÉTER PAR L’ENTREPRISE : adresse complète du siège social].',
  'Un texte  avec deux espaces, une étoile seule * et un calcul 3 * 4, puis __ceci__ et `cela`.\nDeuxième ligne du même paragraphe.   \n\n\n\nAprès trois lignes vides.\n```\nDirecteur\n  └─ Conducteur\n```\n> une citation\n\\## 1. Moyens\n',
  '',
  '\n\n',
  '**Tout en gras**\n***gras et italique***\n* liste à l’étoile\n+ liste au plus\n10) dixième\n#pas un titre\n####### sept dièses',
]

test('découper puis assembler rend le texte au caractère près, quel qu’il soit', () => {
  for (const t of TEXTES) assert.equal(assembler(decouper(t)), t)
})

test('dans un bloc, lire puis écrire les fragments rend le texte signe pour signe', () => {
  for (const t of TEXTES) for (const ligne of t.split('\n')) assert.equal(ecrireFragments(lireFragments(ligne)), ligne)
})

/** Un arbre minimal, à l'image de ce que le navigateur construit à partir de `htmlFragments`. */
function arbre(html: string): NoeudLu {
  const racine: NoeudLu & { childNodes: NoeudLu[] } = { nodeType: 1, nodeName: 'DIV', textContent: null, childNodes: [] }
  const desechapper = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const motif = /<(strong|em|mark)([^>]*)>([\s\S]*?)<\/\1>|([^<]+)/g
  for (const m of html.matchAll(motif)) {
    if (m[4] !== undefined) { racine.childNodes.push({ nodeType: 3, nodeName: '#text', textContent: desechapper(m[4]), childNodes: [] }); continue }
    const texte = desechapper(m[3])
    const brut = m[2].match(/data-brut="([^"]*)"/)
    racine.childNodes.push({
      nodeType: 1, nodeName: m[1].toUpperCase(), textContent: texte,
      childNodes: [{ nodeType: 3, nodeName: '#text', textContent: texte, childNodes: [] }],
      getAttribute: (nom: string) => (nom === 'data-brut' && brut ? desechapper(brut[1]) : null),
    })
  }
  return racine
}

test('une zone de saisie non touchée rend son texte au caractère près, et ne montre aucun signe', () => {
  for (const t of TEXTES) {
    for (const bloc of decouper(t)) {
      if (bloc.type !== 'paragraphe') continue
      const texte = bloc.lignes.join('\n')
      const html = htmlFragments(texte)
      assert.equal(texteDeLaSaisie(arbre(html)), texte)
    }
  }
  const html = htmlFragments('Le **siège** est *ici* : [À COMPLÉTER PAR L\'ENTREPRISE : adresse du siège].')
  const montre = html.replace(/<[^>]+>/g, '')
  assert.equal(montre, 'Le siège est ici : À compléter : adresse du siège.')
  assert.doesNotMatch(montre, /\*|\[|\]|COMPLÉTER/)
  assert.match(html, /<strong>siège<\/strong>/)
  assert.match(html, /<em>ici<\/em>/)
  assert.match(html, /<mark class="a-renseigner"/)
})

test('le texte d’un bloc est échappé : aucune balise du mémoire n’arrive dans la page', () => {
  const html = htmlFragments('a < b & <script>x</script> **<i>**')
  assert.doesNotMatch(html, /<script|<i>/)
  assert.equal(texteDeLaSaisie(arbre(html)), 'a < b & <script>x</script> **<i>**')
})

test('« [À COMPLÉTER PAR L’ENTREPRISE : …] » se lit « À compléter : … », sans crochets ni capitales ; rempli, il devient du texte', () => {
  assert.equal(libelleACompleter('[À COMPLÉTER PAR L\'ENTREPRISE : numéro de SIRET]'), 'À compléter : numéro de SIRET')
  assert.equal(libelleACompleter('[À COMPLÉTER]'), 'À compléter')
  const zone = arbre(htmlFragments('SIRET : [À COMPLÉTER PAR L\'ENTREPRISE : numéro de SIRET]'))
  const marque = (zone.childNodes as NoeudLu[])[1]
  marque.textContent = '123 456 789 00012'
  assert.equal(texteDeLaSaisie(zone), 'SIRET : 123 456 789 00012')
})

test('un passage « à compléter » écrit en italique ou en gras reste un seul passage, sans crochets ni étoiles à l’écran', () => {
  for (const texte of ["*[À COMPLÉTER PAR L'ENTREPRISE : nom du signataire]*", "Fait à **[À COMPLÉTER PAR L'ENTREPRISE : ville]**, le 3 mai."]) {
    assert.equal(ecrireFragments(lireFragments(texte)), texte)
    const html = htmlFragments(texte)
    assert.doesNotMatch(html.replace(/<[^>]+>/g, ''), /\*|\[|\]|COMPLÉTER/)
    assert.equal(texteDeLaSaisie(arbre(html)), texte)
  }
})

test('ce que le navigateur pose en écrivant (b, i, div, br) redevient les signes du texte enregistré', () => {
  const t = (texte: string): NoeudLu => ({ nodeType: 3, nodeName: '#text', textContent: texte, childNodes: [] })
  const e = (nom: string, ...enfants: NoeudLu[]): NoeudLu => ({ nodeType: 1, nodeName: nom, textContent: null, childNodes: enfants })
  assert.equal(texteDeLaSaisie(e('DIV', t('Un '), e('B', t('mot ')), t('et '), e('I', t('un autre')), t('.'))), 'Un **mot** et *un autre*.')
  assert.equal(texteDeLaSaisie(e('DIV', t('Ligne'), e('BR'), t('suite'), e('BR'))), 'Ligne\nsuite')
  assert.equal(texteDeLaSaisie(e('DIV', t('Un'), e('DIV', t('Deux')))), 'Un\nDeux')
  assert.equal(texteDeLaSaisie(e('DIV', e('STRONG', t('  ')))), '  ')
})

test('corriger un bloc ne change que ses lignes ; les autres gardent leur identité', () => {
  const texte = TEXTES[0]
  const blocs = decouper(texte)
  const cible = blocs.find((b) => b.type === 'paragraphe' && b.lignes[0].startsWith('Un conducteur'))!
  const suite = remplacerBloc(blocs, cible.id, ['Un conducteur de travaux, présent **deux jours** par semaine.'])
  const avant = texte.split('\n')
  const apres = assembler(suite).split('\n')
  assert.equal(apres.length, avant.length)
  const differentes = avant.flatMap((l, i) => (l === apres[i] ? [] : [i]))
  assert.equal(differentes.length, 1)
  assert.equal(avant[differentes[0]], cible.lignes[0])
  assert.deepEqual(suite.map((b) => b.id), blocs.map((b) => b.id))
  // un paragraphe coupé en deux : les blocs d'avant et d'après ne bougent pas
  const coupe = remplacerBloc(blocs, cible.id, ['Un conducteur.', '', 'Un second paragraphe.'])
  assert.equal(assembler(coupe), texte.replace(cible.lignes[0], 'Un conducteur.\n\nUn second paragraphe.'))
  assert.equal(coupe[0], blocs[0])
  assert.equal(coupe[coupe.length - 1], blocs[blocs.length - 1])
})

test('une cellule de tableau se corrige seule : barres, espaces et autres cellules ne bougent pas', () => {
  const ligne = '| Conducteur |  M. Petit  | 12 |'
  assert.equal(morceauxLigneTable(ligne).join('|'), ligne)
  assert.deepEqual(cellulesLigneTable(ligne).map((c) => c.texte), ['Conducteur', 'M. Petit', '12'])
  const cellule = cellulesLigneTable(ligne)[1]
  assert.equal(remplacerCellule(ligne, cellule.morceau, 'Mme Roy | cheffe'), '| Conducteur |  Mme Roy \\| cheffe  | 12 |')
  assert.equal(remplacerCellule(ligne, cellule.morceau, cellule.texte), ligne)
})

test('le mémoire entier : ouvrir l’éditeur puis enregistrer sans rien changer rend le mémoire identique', () => {
  const contenu = {
    preambule: 'L’entreprise **Dupré** remet son offre.\n\n## Engagement\n\n[À COMPLÉTER PAR L\'ENTREPRISE : nom du signataire]',
    partie_a: { implantation: '### Siège\n\n- Reims\n- Épernay\n\n| Site | Effectif |\n|---|---|\n| Reims | 12 |', organigramme: '```\nGérant\n  └─ Conducteur\n```', references: '1. École\n2. Mairie', engagement_qualitatif: 'Qualibat.' },
    partie_b: { dechets: 'Tri *sélectif*.', environnement: '' },
    partie_c: { methodologie: 'Phasage.', delai: '4 mois.' },
  } as unknown as MemoireContent
  const texte = versMarkdown(contenu)
  const structure = titresEditeur(contenu)
  const blocs = decouper(texte, structure)
  assert.equal(assembler(blocs), texte)
  assert.deepEqual(depuisMarkdown(assembler(blocs), contenu), contenu)
  // les titres de partie et de section sont reconnus : ils se lisent, ils ne se modifient pas
  assert.ok(blocs.some((b) => b.type === 'structure' && b.lignes[0] === '# PRÉAMBULE'))
  assert.ok(blocs.filter((b) => b.type === 'structure').length >= 5)
  // une correction dans une partie ne change que cette partie
  const cible = blocs.find((b) => b.lignes[0] === 'Qualibat.')!
  const relu = depuisMarkdown(assembler(remplacerBloc(blocs, cible.id, ['Qualibat **7131**.'], structure)), contenu)
  assert.deepEqual(relu, { ...contenu, partie_a: { ...contenu.partie_a, engagement_qualitatif: 'Qualibat **7131**.' } })
})

test('l’éditeur n’est plus une zone de texte brute : ni ligne d’aide des signes, ni bouton « Enregistrer », ni « l’IA »', () => {
  const editeur = sansCommentaires(lire('src/components/memoire/EditeurMemoire.tsx'))
  assert.doesNotMatch(editeur, /ZoneTexte|<textarea|= titre|= gras|>\s*Enregistrer\s*</)
  assert.match(editeur, /BlocMemoire/)
  const barre = sansCommentaires(lire('src/components/project/RewritePassageBar.tsx'))
  assert.doesNotMatch(barre, /l’IA|l'IA/)
})
