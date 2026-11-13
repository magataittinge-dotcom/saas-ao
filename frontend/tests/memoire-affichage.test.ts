// Tour 3 du jury (lot b2) : le mémoire lu à l'écran est le document qui sera déposé. Le texte enregistré ne change pas ;
// l'écran ne montre pas les notes de l'outil (comme le Word), dessine l'arbre tapé au clavier, écrit un seul titre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lireArbre, retirerConsignes, titreEnTete } from '../src/lib/memoireAffichage'
import { lire } from './outils/sources'

test('les notes de l’outil entre crochets ne sont pas montrées, comme dans le Word', () => {
  const texte = [
    'Notre siège est à 12 km du chantier.',
    '',
    '[Ici : localisation de l\'entreprise par rapport au chantier — la carte est dessinée par Synorix à partir de l\'adresse renseignée, rien à insérer.]',
    '',
    'Suite du texte. [L\'organigramme visuel n\'est pas intégré dans cette version du mémoire.] Fin.',
    '[Insérer une photo du chantier]',
  ].join('\n')
  assert.equal(retirerConsignes(texte), 'Notre siège est à 12 km du chantier.\n\n\nSuite du texte. Fin.')
})

test('ce qui n’est pas une note de l’outil reste : passage à compléter, lien, crochets ordinaires', () => {
  for (const t of [
    'Siège : [À COMPLÉTER : adresse complète du siège social]',
    'Voir [notre plan](https://exemple.invalid/plan) pour le détail.',
    'Classement de réaction au feu [A2-s1, d0] exigé au CCTP.',
    'Le plan d\'installation de chantier est joint.',
  ]) assert.equal(retirerConsignes(t), t)
})

test('la règle de l’écran est celle du serveur (mêmes mots déclencheurs)', () => {
  const serveur = lire('../backend/services/docx_exporter.py')
  for (const mot of ['ici\\s*:', "l['’]organigramme", 'ins[ée]rer|ins[ée]rez|ajouter|ajoutez', 'image|photo|sch[ée]ma|visuel|carte|plan|logo', 'synorix']) {
    assert.ok(serveur.includes(mot), `docx_exporter.py porte « ${mot} »`)
    assert.ok(lire('src/lib/memoireAffichage.ts').includes(mot), `memoireAffichage.ts porte « ${mot} »`)
  }
})

test('un organigramme tapé au clavier redevient un arbre', () => {
  const arbre = lireArbre([
    'Direction de l\'entreprise',
    '└── Directeur Travaux (pilotage global, engagements contractuels)',
    '    └── Conducteur de Travaux (interlocuteur unique MOE/MOA, planning, coordination inter-lots)',
    '        └── Chef de Chantier (encadrement quotidien, autocontrôles, sécurité)',
    '            └── Équipe de 4 compagnons (ITE, enduits, bardages, habillages)',
    '    └── Administration (pièces administratives, facturation Chorus Pro, DC4, assurances)',
  ].join('\n'))
  assert.ok(arbre)
  assert.equal(arbre.length, 1)
  assert.equal(arbre[0].texte, 'Direction de l\'entreprise')
  const directeur = arbre[0].enfants[0]
  assert.deepEqual([directeur.texte, directeur.detail], ['Directeur Travaux', 'pilotage global, engagements contractuels'])
  assert.deepEqual(directeur.enfants.map((n) => n.texte), ['Conducteur de Travaux', 'Administration'])
  assert.equal(directeur.enfants[0].enfants[0].enfants[0].texte, 'Équipe de 4 compagnons')
  assert.equal(directeur.enfants[1].detail, 'pièces administratives, facturation Chorus Pro, DC4, assurances')
})

test('un arbre à branches « ├── » et traits verticaux se lit aussi ; un bloc qui n’est pas un arbre reste tel quel', () => {
  const arbre = lireArbre('Gérant\n├── Conducteur\n│   └── Chef de chantier\n└── Secrétariat')
  assert.deepEqual(arbre?.[0].enfants.map((n) => [n.texte, n.enfants.length]), [['Conducteur', 1], ['Secrétariat', 0]])
  assert.equal(lireArbre('Semaine 1 : installation\nSemaine 2 : échafaudage'), null)
  assert.equal(lireArbre('une seule ligne'), null)
})

test('le titre en tête du texte d’une partie se lit une fois', () => {
  assert.deepEqual(titreEnTete('## A.1 — Implantation géographique et proximité du chantier\n\n**Marché** : école.'),
    { titre: 'A.1 — Implantation géographique et proximité du chantier', corps: '**Marché** : école.' })
  assert.deepEqual(titreEnTete('Nous plaçons le démarrage…\n\n## Plus bas'), { titre: null, corps: 'Nous plaçons le démarrage…\n\n## Plus bas' })
  assert.equal(titreEnTete('## Siège [À COMPLÉTER : adresse]\n\nTexte').titre, null)
})
