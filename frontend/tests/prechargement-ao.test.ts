// F-05 (audit QUALITE-FRONT) — ouvrir un AO sans cascade : au survol ou au focus d'un lien vers un AO, la page, le morceau
// de l'étape et la requête du projet partent ensemble ; à l'ouverture d'une adresse d'étape, le morceau de l'étape part
// avec la requête du projet. Mesure (version construite, vite preview) dans le rapport CORRECTIFS-QUALITE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { QueryClient } from '@tanstack/react-query'
import { MORCEAUX_ETAPES, prechargerAO, prechargerDonneesEtape, segmentDuLien } from '@/lib/prechargementAO'
import { projet } from './outils/projetsFactices'
import { lire, sansCommentaires } from './outils/sources'

test('un morceau par étape : les mêmes modules que les lazy() de la page d’un AO', () => {
  const page = sansCommentaires(lire('src/routes/Project.tsx'))
  const lazy = [...page.matchAll(/lazy\(\(\) => import\('\.\/project\/(\w+)'\)\)/g)].map((m) => m[1]).sort()
  const lib = sansCommentaires(lire('src/lib/prechargementAO.ts'))
  const precharges = [...lib.matchAll(/import\('@\/routes\/project\/(\w+)'\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(precharges, lazy)
  assert.deepEqual(Object.keys(MORCEAUX_ETAPES).sort(), ['analysis', 'export', 'lots', 'memoire', 'plan', 'upload', 'verification'])
  // chaque segment préchargé est une route d'étape de la page
  for (const segment of Object.keys(MORCEAUX_ETAPES)) assert.match(page, new RegExp(`path="${segment}"`), segment)
})

test('l’étape d’un lien : celle de l’adresse, sinon celle où renvoie l’index de l’AO', () => {
  const p = projet('ao-1')
  assert.equal(segmentDuLien(p, '/projects/ao-1/export'), 'export')
  assert.equal(segmentDuLien(p, '/projects/ao-1/plan?x=1'), 'plan')
  assert.ok(Object.keys(MORCEAUX_ETAPES).includes(segmentDuLien(p)), segmentDuLien(p))
})

test('au survol : la requête du projet part (même clé que la page), gardée 30 s ; sans fournisseur, rien ne casse', () => {
  const appels: unknown[] = []
  const client = { prefetchQuery: (o: { queryKey: unknown; staleTime: number }) => { appels.push([o.queryKey, o.staleTime]); return Promise.resolve() } }
  prechargerAO(client as unknown as QueryClient, projet('ao-2'), '/projects/ao-2/inconnu')
  assert.deepEqual(appels, [[['projects', 'ao-2'], 30_000]])
  assert.doesNotThrow(() => prechargerAO(undefined, projet('ao-3'), '/projects/ao-3/inconnu'))
})

test('« Télécharger le dossier » : ses deux lectures partent avec le projet, sous les clés que l’étape lit', () => {
  const cles: unknown[] = []
  const client = { prefetchQuery: (o: { queryKey: unknown }) => { cles.push(o.queryKey); return Promise.resolve() } }
  prechargerDonneesEtape(client as unknown as QueryClient, 'export', 'ao-4')
  assert.deepEqual(cles, [['export-detail', 'ao-4'], ['checklist-score', 'ao-4']])
  prechargerDonneesEtape(client as unknown as QueryClient, 'plan', 'ao-4')
  assert.equal(cles.length, 2, 'une étape sans lecture connue : rien')
  const etape = sansCommentaires(lire('src/routes/project/StepExport.tsx'))
  assert.match(etape, /useQuery\(lectureDetailExport<ExportDetail>\(project\.id\)\)/)
  assert.match(etape, /useQuery\(lectureScoreExport<[^>]*>\(project\.id\)\)/)
  const page = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.match(page, /prechargerDonneesEtape\(client, segment, id\)/)
})

test('Mes AO (en cours et terminés), l’Accueil et « À la une » : chaque lien vers un AO précharge au survol, au focus et au toucher', () => {
  for (const f of ['src/components/mesao/LigneAO.tsx', 'src/components/dashboard/BandeAO.tsx', 'src/components/mesao/ALaUne.tsx', 'src/components/mesao/Termines.tsx']) {
    const code = sansCommentaires(lire(f))
    const liens = [...code.matchAll(/<Link to=\{(`\/projects\/\$\{\w+\.id\}`|lienAO\([^)]*\)|lien)\}([^>]*)>/g)]
    assert.ok(liens.length > 0, f)
    for (const [tout, , reste] of liens) assert.match(reste, /\{\.\.\.precharger\(/, `${f} : ${tout}`)
  }
  const lib = sansCommentaires(lire('src/lib/prechargementAO.ts'))
  assert.match(lib, /onMouseEnter: lancer, onFocus: lancer, onTouchStart: lancer/)
})

test('page d’un AO : le morceau de l’étape de l’adresse part avant la requête du projet, pas après', () => {
  const page = sansCommentaires(lire('src/routes/Project.tsx'))
  assert.match(page, /const segment = reste\?\.split\('\/'\)\[0\]/)
  const i = page.indexOf('prechargerEtape(segment)')
  assert.ok(i > 0 && i < page.indexOf('const requete = useProject(id!)'))
  // la page et son préchargement lisent le projet de la même façon
  assert.match(sansCommentaires(lire('src/hooks/useProject.ts')), /queryKey: \['projects', id\],\s*queryFn: \(\) => lireProjet\(id\)/)
})
