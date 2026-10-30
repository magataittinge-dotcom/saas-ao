// Page de démonstration INTERNE (non liée au menu) : « Synorix Intelligence » avec des données inventées.
// Sert aux captures et aux mesures. Paramètres : ?logiciel=1 (accepte le WebGL logiciel, mesures seulement),
// ?vide=1 (aucun AO), ?fab=0 (sans bouton « + » factice),
// ?decalage=N (N pixels vides au-dessus : le visage démarre hors écran, pour les mesures).
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import SynorixIntelligence from '@/components/intelligence/SynorixIntelligence'
import { MAINTENANT_DEMO, PROJETS_DEMO, STATS_DEMO } from '@/lib/intelligence/demo'
import type { DashboardStats } from '@/types'

const STATS_VIDES: DashboardStats = { projects_en_cours: 0, projects_soumis_ce_mois: 0, projects_gagnes: 0, taux_succes: 0, documents_expires: 0, documents_expirant_bientot: 0 }

export default function IntelligenceDemo() {
  const q = useMemo(() => new URLSearchParams(window.location.search), [])
  const vide = q.has('vide')
  const [mode, setMode] = useState('')
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-1, var(--demo-fond, #edf1f4))', padding: '24px 16px 120px' }} data-demo-intelligence data-mode-visage={mode}>
      <style>{`:root[data-theme="nuit"], :root[data-theme="dark"] { --demo-fond: #1d1d1d; }`}</style>
      {Number(q.get('decalage')) > 0 && <div aria-hidden="true" data-decalage style={{ height: Number(q.get('decalage')) }} />}
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <SynorixIntelligence
          projects={vide ? [] : PROJETS_DEMO}
          stats={vide ? STATS_VIDES : STATS_DEMO}
          prenom="Mohamed"
          maintenant={MAINTENANT_DEMO}
          accepterLogiciel={q.has('logiciel')}
          surMode={(m) => setMode(m)}
        />
      </div>
      {q.get('fab') !== '0' && (
        <a href="#nouvel-ao" aria-label="Nouvel AO" data-demo-fab
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 20, width: 56, height: 56, borderRadius: 28, display: 'grid', placeItems: 'center', background: 'var(--accent-fill-solid, #0078d6)', color: '#fff', boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
          <Plus size={22} aria-hidden="true" />
        </a>
      )}
    </div>
  )
}
