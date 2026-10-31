import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import MemoirePreflight, { QuotaMemoire, type PreflightSelection } from '@/components/project/MemoirePreflight'
import type { VariablesMemoire } from '@/lib/memoireGeneration'

const F = "'Inter Variable', 'Geist Sans', sans-serif"

const champStyle = { background: 'var(--surface-0)', border: '1px solid var(--border-field)', color: 'var(--text-1)', fontFamily: F }
const champClasse = 'w-full py-2 px-3 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-ring'
const etiquetteStyle = { color: 'var(--text-1)' }

interface Props {
  projectId: string
  variables: VariablesMemoire
  onVariables: (v: VariablesMemoire) => void
  onPreflight: (sel: PreflightSelection) => void
  stats: { filled: number; total: number; nom_entreprise: string | null } | null
  hasMemoire: boolean
  /** Une génération est en cours (ou en reprise après rechargement). */
  enCours: boolean
  erreur: string | null
  onGenerer: () => void
}

/**
 * S5 — préparation du mémoire. En haut : les 2 champs obligatoires et le bouton, le profil en une ligne.
 * En dessous, repliés : planning, annexes, références, équipe et matériel. Le repli est un <details> :
 * son contenu reste monté, donc la sélection du pré-contrôle part au serveur même repliée.
 */
export default function FormulaireMemoire({
  projectId, variables, onVariables, onPreflight, stats, hasMemoire, enCours, erreur, onGenerer,
}: Props) {
  const maj = (cle: keyof VariablesMemoire) => (e: { target: { value: string } }) =>
    onVariables({ ...variables, [cle]: e.target.value })

  return (
    <div className="space-y-4" style={{ fontFamily: F }}>
      {/* ── L'essentiel : 2 champs, un bouton ── */}
      <div
        className="glass-card rounded-lg p-5 space-y-4"
        style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)' }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>
              Nombre d&apos;ouvriers dédiés <span style={{ color: 'var(--warn)' }}>*</span>
            </label>
            <input
              type="number"
              value={variables.nb_ouvriers}
              onChange={maj('nb_ouvriers')}
              className={champClasse}
              style={champStyle}
              placeholder="Ex : 4"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>
              Délai estimé <span style={{ color: 'var(--warn)' }}>*</span>
            </label>
            <input
              type="text"
              value={variables.delai}
              onChange={maj('delai')}
              className={champClasse}
              style={champStyle}
              placeholder="Ex : 3 mois"
            />
          </div>
        </div>

        {erreur && (
          <p
            className="text-sm rounded-lg px-3 py-2"
            style={{ background: 'color-mix(in srgb, var(--danger-fg) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--danger-fg) 20%, transparent)', color: 'var(--danger-fg)' }}
          >
            {erreur}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            onClick={onGenerer}
            disabled={enCours || !variables.nb_ouvriers || !variables.delai}
            className="signature-btn disabled:opacity-40"
            style={{ fontFamily: F, padding: '12px 24px' }}
          >
            <Sparkles size={18} />
            {hasMemoire ? 'Régénérer le mémoire' : 'Rédiger le mémoire'}
          </button>
          <QuotaMemoire projectId={projectId} />
        </div>
      </div>

      {/* ── Le profil, en une ligne ── */}
      {stats && (
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          Profil : <span className="num-mono">{stats.filled}/{stats.total}</span> renseignés
          {' · '}
          <Link to="/company" className="font-medium underline underline-offset-2" style={{ color: 'var(--text-1)' }}>Compléter</Link>
        </p>
      )}

      {/* ── Options, repliées ── */}
      <details className="group rounded-lg" style={{ border: '1px solid var(--border-1)' }}>
        <summary
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:min-h-11"
          style={{ color: 'var(--text-1)' }}
        >
          Options (facultatif)
          <span className="text-xs font-normal" style={{ color: 'var(--text-3)' }}>
            profil local, références, planning, annexes, équipe, matériel
          </span>
        </summary>
        <div className="space-y-4 px-4 pb-4">
          <MemoirePreflight projectId={projectId} onChange={onPreflight} />

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)', fontFamily: F }}>
                Informations spécifiques à ce chantier
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                Ces informations seront intégrées dans le mémoire pour ce projet
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>Chef de chantier — nom</label>
                <input type="text" value={variables.chef_chantier_nom} onChange={maj('chef_chantier_nom')}
                  className={champClasse} style={champStyle} placeholder="Ex : Jean Dupont" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>Qualification</label>
                <input type="text" value={variables.chef_chantier_qualification} onChange={maj('chef_chantier_qualification')}
                  className={champClasse} style={champStyle} placeholder="Ex : 15 ans d'expérience, CACES R482" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>Conducteur de travaux — nom</label>
                <input type="text" value={variables.conducteur_travaux_nom} onChange={maj('conducteur_travaux_nom')}
                  className={champClasse} style={champStyle} placeholder="Ex : Marie Martin" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>Qualification</label>
                <input type="text" value={variables.conducteur_travaux_qualification} onChange={maj('conducteur_travaux_qualification')}
                  className={champClasse} style={champStyle} placeholder="Ex : ingénieur BTP, 10 ans ITE/ravalement" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>
                Matériel spécifique au chantier
              </label>
              <textarea value={variables.materiel_specifique} onChange={maj('materiel_specifique')} rows={2}
                className={`${champClasse} resize-none`} style={champStyle}
                placeholder="Ex : échafaudage tubulaire R200, nacelle articulée 20 m…" />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={etiquetteStyle}>
                Contraintes particulières
                <span className="font-normal ml-1" style={{ color: 'var(--text-3)' }}>(optionnel)</span>
              </label>
              <textarea value={variables.particularites} onChange={maj('particularites')} rows={2}
                className={`${champClasse} resize-none`} style={champStyle}
                placeholder="Ex : site occupé, horaires restreints 8 h-17 h…" />
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
