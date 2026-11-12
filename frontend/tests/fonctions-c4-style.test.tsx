// C4 — « Le style de mon entreprise » lu dans un ancien mémoire (STYLE_ENTREPRISE, éteinte par défaut côté serveur).
// Éteinte : Mon entreprise est inchangée (aucune carte, aucune requête). Allumée : le style lu, en lecture seule.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApercuStyle, type ReponseStyle } from '@/components/entreprise/StyleEntreprise'
import { lire, sansCommentaires } from './outils/sources'

const LU: ReponseStyle = {
  source_fichier: 'memoire-ecole-2025.docx', lu_le: '2026-11-12T10:00:00',
  style: {
    ton: 'Sobre et technique, sans emphase.', personne: '« nous »', longueur_phrases: 'Moyennes, une idée par phrase.',
    structure: 'Titres numérotés, peu de listes, un tableau des moyens.',
    vocabulaire: ['conducteur de travaux', 'suivi quotidien', 'réception sans réserve'],
    exemples: ['Notre conducteur de travaux assure le suivi quotidien du chantier.'],
  },
}

test('le style lu : chaque trait, les tournures, l’exemple copié, la source et la date', () => {
  const html = renderToStaticMarkup(<ApercuStyle donnees={LU} />)
  for (const t of ['Sobre et technique', 'Titres numérotés', 'conducteur de travaux', 'réception sans réserve',
    '« Notre conducteur de travaux assure le suivi quotidien du chantier. »', 'memoire-ecole-2025.docx', '12 novembre 2026']) {
    assert.ok(html.includes(t), t)
  }
  assert.match(html, /Lecture seule : la rédaction de vos mémoires n’en tient pas compte\./)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('rien de lu : une phrase dit ce que fera la lecture, et qu’elle reste en lecture seule', () => {
  const html = renderToStaticMarkup(<ApercuStyle donnees={{ style: null, source_fichier: null, lu_le: null }} />)
  assert.match(html, /lecture seule/)
  assert.doesNotMatch(html, /data-style-entreprise/)
  assert.doesNotMatch(html, /manquant|incomplet|absent|!/i)
})

test('éteinte : Mon entreprise ne rend la carte (et ne lit la route) que si le serveur dit la fonction allumée', () => {
  const src = sansCommentaires(lire('src/components/entreprise/FormCertifications.tsx'))
  assert.match(src, /const \{ style_entreprise: styleAllume \} = useFonctionsIA\(\)/)
  assert.match(src, /\{styleAllume && \(\s*<Groupe titre="Le style de mon entreprise"/)
  assert.equal((src.match(/<StyleEntreprise \/>/g) ?? []).length, 1)
})

test('lecture seule (D5) : aucun écran de rédaction ne lit le style', () => {
  for (const f of ['src/routes/project/StepMemoire.tsx', 'src/components/memoire/EditeurMemoire.tsx', 'src/routes/project/StepPlan.tsx']) {
    assert.doesNotMatch(lire(f), /entreprise\/style|StyleEntreprise/, f)
  }
})
