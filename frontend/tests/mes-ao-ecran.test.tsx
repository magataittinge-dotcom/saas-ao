// Mes AO refait : une ligne par AO avec le verbe de sa prochaine action, l'avis de la veille d'origine, la jauge d'un dossier en
// lecture (sans bouton), les terminés repliés, l'offre « premier dossier offert » seulement si elle existe. Données inventées.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Projects from '@/routes/Projects'
import { premierDossierOffert } from '@/components/mesao/VideMesAO'
import type { Project } from '@/types'

const jour = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const ao = (id: string, name: string, over: Partial<Project> = {}): Project => ({
  id, organization_id: 'o', name, status: 'en_cours', current_step: 1, completed_steps: { 1: true }, created_at: '2026-10-20T09:00:00', updated_at: '2026-10-28T09:00:00',
  processing_status: 'ready', maitre_ouvrage: 'Commune inventée', ...over,
} as Project)

const LISTE: Project[] = [
  ao('a', 'AO inventé export', { current_step: 6, deadline: jour(3), completed_steps: { 1: true, 2: true, 3: true, 4: true, 5: true }, avancement: { unites: { analyses: 1, memoires: 1 }, pieces: { total: 4, pretes: 4 }, plan_valide_le: null, memoire_ecrit_le: '2026-11-01T10:00:00' } }),
  ao('b', 'AO inventé plan', { current_step: 5, deadline: jour(9), avancement: { unites: { analyses: 1, memoires: 0 }, pieces: null, plan_valide_le: null, memoire_ecrit_le: null } }),
  ao('c', 'AO inventé veille', { current_step: 2, deadline: jour(20), infos_marche: { source_avis: { id_boamp: '26-000001', url_avis: 'https://www.boamp.fr/avis/detail/26-000001' } } }),
  ao('d', 'AO inventé lecture', { current_step: 1, deadline: jour(30), processing_status: 'extracting_text', processing_progress: 54, processing_detail: '14 documents sur 26 lus' }),
  ao('e', 'AO inventé déposé', { status: 'soumis', current_step: 6, depose_at: '2026-10-28T10:00:00' }),
]

function rendre(projets: Project[]) {
  const c = new QueryClient()
  c.setQueryData(['projects'], projets)
  c.setQueryData(['billing-quota'], { plan: 'pro', period_start: null, period_end: null, analyses: { used: 9, limit: 40 }, memoires: { used: 5, limit: 40 } })
  return renderToStaticMarkup(<QueryClientProvider client={c}><MemoryRouter><Projects /></MemoryRouter></QueryClientProvider>)
}

test('chaque ligne porte le verbe de sa prochaine action ; jamais « Continuer »', () => {
  const html = rendre(LISTE)
  for (const verbe of ['Télécharger le dossier', 'Préparer le plan du mémoire', 'Choisir le lot']) assert.ok(html.includes(verbe), verbe)
  assert.ok(!html.includes('Continuer'))
  assert.equal((html.match(/data-ligne-ao="/g) ?? []).length, 4, 'une ligne par AO en cours')
})

test('un dossier en lecture : la jauge et le détail, aucun bouton d\'action', () => {
  const html = rendre(LISTE)
  const ligne = html.split('data-ligne-ao="d"')[1].split('</article>')[0]
  assert.ok(ligne.includes('14 documents sur 26 lus'))
  assert.ok(!ligne.includes('/projects/d/upload'), 'pas de lien d\'action')
  assert.ok(ligne.includes('Synorix s’en occupe'))
})

test('l\'avis de la veille d\'origine : un lien externe sûr, sinon rien', () => {
  const html = rendre(LISTE)
  assert.ok(html.includes('href="https://www.boamp.fr/avis/detail/26-000001"') && html.includes('rel="noopener noreferrer"'))
  assert.equal((html.match(/Trouvé par la veille/g) ?? []).length, 1)
})

test('les unités : affichées quand le serveur les donne, rien d\'inventé sinon ; terminés repliés', () => {
  const html = rendre(LISTE)
  const sans = html.split('data-ligne-ao="c"')[1].split('</article>')[0]
  assert.ok(!sans.includes('analyse'), 'sans avancement, pas de ligne d\'unités')
  assert.ok(html.includes('1 analyse') && html.includes('0 mémoire'))
  assert.ok(!html.includes('data-terminee='), 'les terminés sont repliés par défaut')
  assert.ok(html.includes('aria-expanded="false"') && html.includes('Déposé 1'))
})

test('« Votre premier dossier est offert » : seulement pour un compte à l\'essai intact', () => {
  assert.equal(premierDossierOffert('free', true, 0), true)
  assert.equal(premierDossierOffert('free', undefined, 0), true)
  assert.equal(premierDossierOffert('free', false, 0), false, 'essai non accordé (1 SIRET = 1 essai)')
  assert.equal(premierDossierOffert('free', true, 1), false, 'essai consommé')
  assert.equal(premierDossierOffert('pro', true, 0), false)
  assert.equal(premierDossierOffert('free', true, undefined), false, 'quota pas encore lu')
})
