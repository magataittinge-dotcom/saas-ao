// 1.9 — Le mémoire à l'écran : le sommaire mène à des sections de même nom,
// les libellés ont leurs accents, l'éditeur corrige l'orthographe.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { DocumentView } from '@/routes/project/StepMemoire'
import { sommaireMemoire } from '@/lib/memoireSections'
import type { MemoireContent, Project } from '@/types'
import { lire, sansCommentaires } from './outils/sources'
import { textesAffiches } from './outils/textes'

const CONTENU = {
  preambule: 'Nous avons l’honneur…',
  partie_a: { implantation: 'Reims.', organigramme: 'Équipe.', references: 'Trois chantiers.', engagement_qualitatif: 'Qualibat.' },
  partie_b: { dechets: 'Tri sélectif.', environnement: '' },
  partie_c: { methodologie: 'Phasage.', delai: '4 mois.' },
} as unknown as MemoireContent

const normaliser = (t: string) => t.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').trim().toLocaleLowerCase('fr')

/** Le titre (h2/h3) qui suit l'élément d'identifiant `id` dans le HTML rendu. */
function titreDe(html: string, id: string): string | null {
  const i = html.indexOf(`id="${id}"`)
  if (i < 0) return null
  const m = html.slice(i).match(/<h[23][^>]*>([^<]*)<\/h[23]>/)
  return m ? normaliser(m[1]) : null
}

test('chaque entrée du sommaire mène à la section de même nom', () => {
  const html = renderToStaticMarkup(
    <DocumentView content={CONTENU} project={{ name: 'AO test' } as Project} docRef={{ current: null }} />,
  )
  const entrees = sommaireMemoire(CONTENU as never)
  const toutes = entrees.flatMap((e) => [e, ...e.enfants])
  assert.ok(toutes.length >= 10)
  for (const e of toutes) {
    assert.equal(titreDe(html, e.id), normaliser(e.titre), `entrée « ${e.titre} » → #${e.id}`)
  }
  // seules les sections rédigées figurent au sommaire ; aucun identifiant en double
  assert.ok(!toutes.some((e) => e.id === 'sec-environnement'))
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length)
})

test('plus aucun libellé sans accent sur l\'écran du mémoire', () => {
  const sansAccent = /\b(dedies?|delai|estime|materiel|specifique|particulieres?|experience|ingenieur|echafaudage|articulee|occupe|memoire|genere|redige|reference|equipe|securite|qualite|methodologie|deja)\b/i
  const fautes = ['src/routes/project/StepMemoire.tsx', 'src/components/project/FormulaireMemoire.tsx', 'src/components/project/MemoirePreflight.tsx', 'src/components/project/RewritePassageBar.tsx']
    .flatMap((f) => textesAffiches(f))
    .filter((t) => sansAccent.test(t.texte))
    .map((t) => `${t.fichier}:${t.ligne} « ${t.texte.trim()} »`)
  assert.deepEqual(fautes, [])
})

test("l'éditeur du mémoire corrige l'orthographe en français", () => {
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(code, /spellCheck\s*\n\s*lang="fr"/)
  assert.doesNotMatch(code, /spellCheck=\{false\}/)
})

// ── S5 — l'écran de préparation : l'essentiel et le bouton en haut, le reste sous « Options (facultatif) » ──
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import FormulaireMemoire from '@/components/project/FormulaireMemoire'
import { corpsGeneration, VARIABLES_VIDES } from '@/lib/memoireGeneration'
import type { PreflightSelection } from '@/components/project/MemoirePreflight'

function formulaire(props: Partial<Parameters<typeof FormulaireMemoire>[0]> = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <FormulaireMemoire
          projectId="p1" variables={VARIABLES_VIDES} onVariables={() => {}} onPreflight={() => {}}
          stats={{ filled: 3, total: 18, nom_entreprise: null }} hasMemoire={false} enCours={false}
          erreur={null} onGenerer={() => {}} {...props} />
      </MemoryRouter>
    </QueryClientProvider>)
}

test('les 2 champs obligatoires et le bouton viennent avant les options, qui sont repliées', () => {
  const html = formulaire()
  const iOuvriers = html.indexOf("Nombre d&#x27;ouvriers dédiés")
  const iDelai = html.indexOf('Délai estimé')
  const iBouton = html.indexOf('Rédiger le mémoire')
  const iOptions = html.indexOf('Options (facultatif)')
  assert.ok(iOuvriers > 0 && iDelai > iOuvriers && iBouton > iDelai, 'champs puis bouton')
  assert.ok(iOptions > iBouton, 'les options sont sous le bouton')
  const details = html.match(/<details[^>]*>/)?.[0] ?? ''
  assert.ok(details && !/\bopen\b/.test(details), 'repli fermé par défaut')
  // ce qui est facultatif est dans le repli
  const repli = html.slice(html.indexOf('<details'))
  for (const t of ['Chef de chantier', 'Conducteur de travaux', 'Matériel spécifique au chantier', 'Contraintes particulières']) {
    assert.ok(repli.includes(t), `${t} sous « Options »`)
    assert.ok(html.indexOf(t) > iOptions, `${t} après le bouton`)
  }
})

test('un seul bouton principal, pas d\'« Étape suivante » grisé, pas d\'« Export .docx » sur cet écran', () => {
  const html = formulaire()
  assert.equal((html.match(/signature-btn/g) ?? []).length, 1, 'un seul bouton principal')
  assert.ok(html.indexOf('signature-btn') < html.indexOf('<details'), 'au-dessus des options')
  assert.ok(!html.includes('Étape suivante'))
  assert.ok(!html.includes('Export .docx'))
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.doesNotMatch(code, /Export \.docx|lancerExportWord|exportToWord/, 'plus d\'export Word sur l\'écran Mémoire')
  // l'étape suivante n'existe plus que sur le document rédigé, où elle est active
  assert.match(code, /Étape suivante : Export/)
  assert.doesNotMatch(code, /disabled=\{!hasMemoire\}/)
})

test('le bouton dit « Rédiger le mémoire », ou « Régénérer le mémoire » quand il existe déjà ; il reste bloqué sans les 2 champs', () => {
  assert.ok(formulaire().includes('Rédiger le mémoire'))
  assert.ok(formulaire({ hasMemoire: true }).includes('Régénérer le mémoire'))
  const bouton = (h: string) => h.match(/<button[^>]*signature-btn[^>]*>/)?.[0] ?? ''
  assert.match(bouton(formulaire()), /disabled=""/)
  assert.doesNotMatch(bouton(formulaire({ variables: { ...VARIABLES_VIDES, nb_ouvriers: '4', delai: '3 mois' } })), /disabled=""/)
  assert.match(bouton(formulaire({ variables: { ...VARIABLES_VIDES, nb_ouvriers: '4', delai: '3 mois' }, enCours: true })), /disabled=""/)
})

test('le profil tient en une ligne : « Profil : X/18 renseignés · Compléter »', () => {
  const html = formulaire()
  const texte = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '')
  assert.match(texte, /Profil : 3\/18 renseignés · Compléter/)
  assert.match(html, /<a[^>]*href="\/company"[^>]*>Compléter<\/a>/)
  assert.ok(!html.includes('Profil de votre entreprise'), 'plus de carte de profil')
  assert.ok(!formulaire({ stats: null }).includes('Profil :'))
})

// La charge utile du POST /memoire/generate reste exactement celle d'avant. Copie verbatim de l'ancien code :
const ancienCorps = (variables: typeof VARIABLES_VIDES, pre: PreflightSelection) => ({
  nb_ouvriers: variables.nb_ouvriers ? parseInt(variables.nb_ouvriers) : undefined,
  delai: variables.delai || undefined,
  chef_chantier_nom: variables.chef_chantier_nom || undefined,
  chef_chantier_qualification: variables.chef_chantier_qualification || undefined,
  conducteur_travaux_nom: variables.conducteur_travaux_nom || undefined,
  conducteur_travaux_qualification: variables.conducteur_travaux_qualification || undefined,
  materiel_specifique: variables.materiel_specifique || undefined,
  particularites: variables.particularites || undefined,
  profile_overrides: pre.profile_overrides || undefined,
  reference_ids: pre.reference_ids || undefined,
  update_profile: pre.update_profile || undefined,
  include_organigramme: pre.include_organigramme || undefined,
  gantt_phases: pre.gantt_phases || undefined,
  annexe_document_ids: pre.annexe_document_ids || undefined,
})

test('la charge utile envoyée au serveur est identique à celle d\'avant (même objet, mêmes clés)', () => {
  const vide: PreflightSelection = { profile_overrides: null, reference_ids: null, update_profile: false,
    include_organigramme: false, gantt_phases: null, annexe_document_ids: null }
  const plein: PreflightSelection = { profile_overrides: { materiel: 'Grue' }, reference_ids: ['a', 'b'], update_profile: true,
    include_organigramme: true, gantt_phases: [{ nom: 'Gros œuvre', duree_semaines: 6 }], annexe_document_ids: ['d1'] }
  const complet = { nb_ouvriers: '4', delai: '3 mois', chef_chantier_nom: 'A. Test', chef_chantier_qualification: 'CACES',
    conducteur_travaux_nom: 'B. Test', conducteur_travaux_qualification: 'Ingénieur', materiel_specifique: 'Nacelle',
    particularites: 'Site occupé' }
  const cas = [
    [VARIABLES_VIDES, vide], [{ ...VARIABLES_VIDES, nb_ouvriers: '4', delai: '3 mois' }, vide],
    [complet, plein], [{ ...complet, nb_ouvriers: '12' }, vide],
  ] as const
  for (const [v, p] of cas) {
    assert.deepEqual(corpsGeneration(v, p), ancienCorps(v, p))
    assert.deepEqual(Object.keys(corpsGeneration(v, p)), Object.keys(ancienCorps(v, p)), 'même ordre de clés')
    assert.equal(JSON.stringify(corpsGeneration(v, p)), JSON.stringify(ancienCorps(v, p)))
  }
  const code = sansCommentaires(lire('src/routes/project/StepMemoire.tsx'))
  assert.match(code, /corpsGeneration\(variables, preflightRef\.current\)/)
  assert.match(code, /\{ timeout: 60_000 \}/)
})

test('le formulaire et le repli ne gardent aucun libellé sans accent', () => {
  const sansAccent = /\b(dedies?|delai|estime|materiel|specifique|particulieres?|experience|ingenieur|echafaudage|articulee|occupe|memoire|genere|redige|reference|equipe|securite|qualite|methodologie|deja)\b/i
  const fautes = textesAffiches('src/components/project/FormulaireMemoire.tsx').filter((t) => sansAccent.test(t.texte))
  assert.deepEqual(fautes.map((t) => t.texte), [])
})
