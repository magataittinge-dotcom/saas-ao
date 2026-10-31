// Textes affichés à l'utilisateur dans un fichier .ts/.tsx, extraits avec
// l'analyseur de TypeScript (déjà présent dans node_modules) : texte JSX,
// chaînes et gabarits — hors identifiants techniques (comparaisons de statut,
// types, imports, classes CSS, chemins d'API, clés de requête…).
import { createRequire } from 'node:module'
import path from 'node:path'
import type * as TS from 'typescript'
import { RACINE, lire } from './sources'

const ts: typeof TS = createRequire(path.join(RACINE, 'package.json'))('typescript')

const ATTRIBUTS_TECHNIQUES = new Set([
  'className', 'style', 'key', 'id', 'to', 'href', 'type', 'name', 'role', 'target', 'rel', 'htmlFor', 'path',
  'src', 'accept', 'method', 'action', 'autoComplete', 'inputMode', 'pattern', 'form', 'variant', 'feature',
  'size', 'fill', 'stroke', 'd', 'viewBox', 'xmlns', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin',
  'currentStep', 'phase', 'state', 'code',
])
const PROPRIETES_TECHNIQUES = new Set([
  'id', 'key', 'segment', 'variant', 'type', 'status', 'kind', 'color', 'className', 'to', 'href', 'path',
  'queryKey', 'mode', 'part', 'cle', 'icon', 'pillClass', 'bg', 'border', 'background', 'fontFamily',
  'boxShadow', 'responseType', 'contentType', 'method', 'anim', 'dur', 'delay', 'top', 'left', 'right', 'bottom',
])
const APPELS_TECHNIQUES = /^(developper|nomSigle|api\.(get|post|patch|put|delete)|navigate|fetch|setSearchParams|useQuery|invalidateQueries|getElementById|querySelector(All)?|addEventListener|removeEventListener|createElement|setAttribute|getItem|setItem|removeItem|startsWith|endsWith|includes|split|replace|match|test|format|toLocaleDateString|toLocaleTimeString|Intl\.\w+|new Date|require|import)$/

/** Un mot seul en minuscules (« free », « upload », « deadline ») passé à une fonction,
 *  en valeur par défaut ou dans un tableau : une clé technique, pas un texte affiché. */
function cleTechnique(n: TS.Node, p: TS.Node): boolean {
  const texte = (n as TS.StringLiteral).text
  if (!/^[a-z][a-z0-9_-]*$/.test(texte)) return false
  return ts.isCallExpression(p) || ts.isNewExpression(p) || ts.isArrayLiteralExpression(p)
    || ts.isVariableDeclaration(p) || ts.isReturnStatement(p) || ts.isParameter(p)
    || (ts.isBinaryExpression(p) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.EqualsToken].includes(p.operatorToken.kind))
}

function technique(n: TS.Node): boolean {
  const p = n.parent
  if (!p) return false
  if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && cleTechnique(n, p)) return true
  // Branche d'un « a ? 'x' : 'y' » : technique si le mot est une clé et que l'expression l'est.
  if (ts.isConditionalExpression(p) && (p.whenTrue === n || p.whenFalse === n)) {
    return /^[a-z][a-z0-9_-]*$/.test((n as TS.StringLiteral).text) && technique(p)
  }
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true
  if (ts.isLiteralTypeNode(p) || ts.isCaseClause(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true
  if (ts.isPropertyAssignment(p)) {
    if (p.name === n) return true
    if (ts.isIdentifier(p.name) && PROPRIETES_TECHNIQUES.has(p.name.text)) return true
  }
  if (ts.isJsxAttribute(p)) return ATTRIBUTS_TECHNIQUES.has(p.name.getText()) || p.name.getText().startsWith('data-')
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) {
    return ATTRIBUTS_TECHNIQUES.has(p.parent.name.getText())
  }
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const appel = p.expression.getText()
    if (APPELS_TECHNIQUES.test(appel) || /\.(includes|startsWith|endsWith|split|replace|match|test|get|has|set|add|delete)$/.test(appel)) return true
  }
  if (ts.isArrayLiteralExpression(p) && p.parent && ts.isPropertyAssignment(p.parent) && ts.isIdentifier(p.parent.name)
    && p.parent.name.text === 'queryKey') return true
  return false
}

export interface TexteAffiche { fichier: string; ligne: number; texte: string }

export function textesAffiches(fichier: string): TexteAffiche[] {
  const source = ts.createSourceFile(fichier, lire(fichier), ts.ScriptTarget.Latest, true,
    fichier.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const res: TexteAffiche[] = []
  const ajouter = (n: TS.Node, texte: string) => {
    if (!texte.trim()) return
    res.push({ fichier, ligne: source.getLineAndCharacterOfPosition(n.getStart()).line + 1, texte })
  }
  const visiter = (n: TS.Node) => {
    if (ts.isJsxText(n)) ajouter(n, n.text)
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !technique(n)) ajouter(n, n.text)
    else if (ts.isTemplateExpression(n) && !technique(n)) {
      ajouter(n, [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' … '))
    }
    ts.forEachChild(n, visiter)
  }
  visiter(source)
  return res
}
