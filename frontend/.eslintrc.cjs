// Configuration ESLint du front (Q-02, audit QUALITE-FRONT § 3). `npm run lint` : 0 erreur, 0 avertissement.
// Écarts justifiés, un par un :
// - `react-refresh/only-export-components` coupé : il ne sert qu'au rechargement à chaud et signale les
//   fichiers qui exportent un composant et une constante, ce qui est voulu ici (62 avertissements à l'audit).
// - `no-irregular-whitespace` ignore chaînes, gabarits, expressions régulières, commentaires et texte JSX :
//   les espaces insécables y sont la typographie française voulue (« 12 jours », « : »).
// - `no-unused-vars` : un nom qui commence par `_` est écarté exprès (argument gardé pour la signature).
// - `no-constant-condition` : `while (true)` est la boucle de lecture d'un flux, qui sort par `break`.
// - tests : `any` permis pour lire un arbre libre (traduction de Clerk) ; `tsc` ne vérifie pas `tests/`.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': 'off',
    'no-irregular-whitespace': [
      'error',
      { skipStrings: true, skipTemplates: true, skipRegExps: true, skipComments: true, skipJSXText: true },
    ],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-constant-condition': ['error', { checkLoops: false }],
  },
  overrides: [
    { files: ['tests/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  ],
}
