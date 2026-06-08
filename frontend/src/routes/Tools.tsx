import { useState } from 'react'
import {
  Calculator, Gavel, Coins, Plus, Trash2, Loader2, ShieldCheck,
} from 'lucide-react'
import { api } from '@/services/api'
import { formatMontant } from '@/lib/utils'
import { StatusBadge } from '@/components/common/StatusBadge'
import AiTip from '@/components/common/AiTip'

const F = "'DM Sans', sans-serif"

// ── Contrat backend (POST /api/calculators/*) ───────────────────────────────
interface OabResult {
  m1: number
  m2: number
  seuil_oab_euros: number
  marge_avant_oab: number
  gauge: 'vert' | 'orange' | 'rouge'
  est_oab: boolean
  rappel_juridique: string
  avertissements: string[]
  sources_nbk: string[]
}
interface Poste {
  poste: string
  montant: number
  base: string
  detail: string
}
interface RetenueResult {
  montant_ttc: number
  postes: Poste[]
  avertissements: string[]
}

type BadgeVariant = 'success' | 'warning' | 'danger'
const GAUGE: Record<OabResult['gauge'], { variant: BadgeVariant; label: string }> = {
  vert:   { variant: 'success', label: '✓ Offre dans la norme' },
  orange: { variant: 'warning', label: 'Point de vigilance' },
  rouge:  { variant: 'danger',  label: 'Sous le seuil de détection' },
}

function apiError(e: unknown): string {
  const status = (e as { response?: { status?: number } })?.response?.status
  if (status === 422) return 'Vérifiez les valeurs saisies (montants strictement positifs).'
  return 'Une erreur est survenue lors du calcul. Réessayez.'
}

// ── Petits éléments d'affichage cohérents avec le design system ─────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-3 py-2.5 text-center"
      style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}
    >
      <p className="text-base font-bold" style={{ color: '#0F172A', fontFamily: F }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: '#64748B' }}>{label}</p>
    </div>
  )
}

function Field({
  id, label, hint, children,
}: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5 text-ds-text-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] mt-1 text-ds-text-3">{hint}</p>}
    </div>
  )
}

// ── Outil 1 — Calculateur OAB ────────────────────────────────────────────────
function OabCalculator() {
  const [prixCandidat, setPrixCandidat] = useState('')
  const [offres, setOffres] = useState<string[]>(['', '', ''])
  const [seuil, setSeuil] = useState('0.9')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OabResult | null>(null)

  const prixNum = Number(prixCandidat)
  const valid = prixCandidat !== '' && prixNum > 0

  const setOffre = (i: number, v: string) =>
    setOffres((o) => o.map((x, idx) => (idx === i ? v : x)))
  const addOffre = () => setOffres((o) => [...o, ''])
  const removeOffre = (i: number) => setOffres((o) => o.filter((_, idx) => idx !== i))

  async function calculer() {
    if (!valid) {
      setError('Saisissez le montant de votre offre (€ HT, positif).')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const prix_offres = offres.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      const { data } = await api.post<OabResult>('/calculators/oab', {
        prix_candidat: prixNum,
        prix_offres,
        seuil_oab: Number(seuil) > 0 ? Number(seuil) : 0.9,
      })
      setResult(data)
    } catch (e) {
      setError(apiError(e))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-6 flex flex-col">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F0F9FF' }}>
          <Gavel size={18} style={{ color: '#0EA5E9' }} />
        </div>
        <div>
          <h2 className="text-base font-bold text-ds-text" style={{ fontFamily: F }}>Offre anormalement basse</h2>
          <p className="text-xs text-ds-text-2">Seuil de détection — double moyenne (art. L2152-5 CCP)</p>
        </div>
      </div>

      <div className="space-y-4 mt-4">
        <Field id="oab-candidat" label="Montant de votre offre (€ HT)">
          <input
            id="oab-candidat" type="number" min={0} inputMode="decimal"
            className="input-dark" placeholder="ex : 85000"
            value={prixCandidat} onChange={(e) => setPrixCandidat(e.target.value)}
          />
        </Field>

        <Field id="oab-offres" label="Offres concurrentes (€ HT)" hint="Connues après ouverture des plis. Laissez vide pour une estimation sur votre seule offre.">
          <div className="space-y-2">
            {offres.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  id={i === 0 ? 'oab-offres' : undefined}
                  type="number" min={0} inputMode="decimal"
                  className="input-dark" placeholder={`Offre ${i + 1}`}
                  value={o} onChange={(e) => setOffre(i, e.target.value)}
                  aria-label={`Offre concurrente ${i + 1}`}
                />
                {offres.length > 1 && (
                  <button
                    type="button" onClick={() => removeOffre(i)}
                    className="shrink-0 p-2 rounded-lg transition-colors hover:bg-slate-100"
                    style={{ cursor: 'pointer', color: '#94A3B8' }}
                    aria-label={`Retirer l'offre ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button" onClick={addOffre}
              className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
              style={{ color: '#0EA5E9', cursor: 'pointer' }}
            >
              <Plus size={13} /> Ajouter une offre
            </button>
          </div>
        </Field>

        <Field id="oab-seuil" label="Seuil de détection (fraction de M2)" hint="Défaut 0,90 (art. L2152-5).">
          <input
            id="oab-seuil" type="number" min={0} max={1} step={0.05} inputMode="decimal"
            className="input-dark w-32" value={seuil} onChange={(e) => setSeuil(e.target.value)}
          />
        </Field>

        <button
          onClick={calculer} disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <><Loader2 size={15} className="animate-spin" /> Calcul…</> : 'Calculer le seuil OAB'}
        </button>

        {error && (
          <p className="text-xs font-medium" style={{ color: '#DC2626' }} role="alert">{error}</p>
        )}
      </div>

      {result && (
        <div className="mt-5 pt-5 space-y-4" style={{ borderTop: '1px solid #F1F5F9' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ds-text-3">Résultat</span>
            <StatusBadge label={GAUGE[result.gauge].label} variant={GAUGE[result.gauge].variant} />
          </div>

          <p className="text-sm leading-relaxed" style={{ color: '#334155' }}>
            {result.est_oab ? (
              <>Votre offre se situe <strong>sous le seuil de détection</strong> de l'offre anormalement basse.
              L'acheteur <strong>peut vous demander des justifications</strong> (art. L2152-5 CCP) — ce n'est pas un rejet automatique.</>
            ) : (
              <>Votre offre se situe <strong>au-dessus du seuil de détection</strong> (art. L2152-5 CCP).
              Aucun risque d'offre anormalement basse signalé.</>
            )}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Moyenne M1" value={formatMontant(result.m1)} />
            <Stat label="Moyenne M2" value={formatMontant(result.m2)} />
            <Stat label="Seuil OAB" value={formatMontant(result.seuil_oab_euros)} />
            <Stat label="Marge au seuil" value={formatMontant(result.marge_avant_oab)} />
          </div>

          <div className="space-y-2">
            {result.rappel_juridique && (
              <AiTip tip={{ id: 'oab-juridique', variant: 'info', text: result.rappel_juridique }} onDismiss={() => {}} />
            )}
            {result.avertissements.map((a, i) => (
              <AiTip key={i} tip={{ id: `oab-warn-${i}`, variant: 'warning', text: a }} onDismiss={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Outil 2 — Calculateur retenue de garantie ────────────────────────────────
function RetenueCalculator() {
  const [montantHt, setMontantHt] = useState('')
  const [tauxRg, setTauxRg] = useState('0.05')
  const [tva, setTva] = useState('0.20')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [joursRetard, setJoursRetard] = useState('0')
  const [diviseur, setDiviseur] = useState('3000')
  const [tauxBce, setTauxBce] = useState('0')
  const [joursPaiement, setJoursPaiement] = useState('0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RetenueResult | null>(null)

  const montantNum = Number(montantHt)
  const valid = montantHt !== '' && montantNum > 0

  async function calculer() {
    if (!valid) {
      setError('Saisissez le montant du marché (€ HT, positif).')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post<RetenueResult>('/calculators/retenue-garantie', {
        montant_ht: montantNum,
        taux_rg: Number(tauxRg),
        tva: Number(tva),
        jours_retard_execution: Number(joursRetard) || 0,
        penalite_diviseur: Number(diviseur) || 3000,
        taux_bce: Number(tauxBce) || 0,
        jours_retard_paiement: Number(joursPaiement) || 0,
      })
      setResult(data)
    } catch (e) {
      setError(apiError(e))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card p-6 flex flex-col">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#F0F9FF' }}>
          <Coins size={18} style={{ color: '#0EA5E9' }} />
        </div>
        <div>
          <h2 className="text-base font-bold text-ds-text" style={{ fontFamily: F }}>Retenue de garantie</h2>
          <p className="text-xs text-ds-text-2">Retenue, pénalités & intérêts moratoires (CCAG-Travaux Art.19)</p>
        </div>
      </div>

      <div className="space-y-4 mt-4">
        <Field id="rg-montant" label="Montant du marché (€ HT)">
          <input
            id="rg-montant" type="number" min={0} inputMode="decimal"
            className="input-dark" placeholder="ex : 250000"
            value={montantHt} onChange={(e) => setMontantHt(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field id="rg-taux" label="Taux de retenue">
            <select
              id="rg-taux" className="input-dark" value={tauxRg}
              onChange={(e) => setTauxRg(e.target.value)} style={{ cursor: 'pointer' }}
            >
              <option value="0.05">5 % (standard)</option>
              <option value="0.02">2 % (PME / TPE)</option>
              <option value="0">0 % (non prévue)</option>
            </select>
          </Field>
          <Field id="rg-tva" label="TVA">
            <select
              id="rg-tva" className="input-dark" value={tva}
              onChange={(e) => setTva(e.target.value)} style={{ cursor: 'pointer' }}
            >
              <option value="0.20">20 %</option>
              <option value="0.10">10 %</option>
              <option value="0.055">5,5 %</option>
              <option value="0">0 %</option>
            </select>
          </Field>
        </div>

        <button
          type="button" onClick={() => setShowAdvanced((s) => !s)}
          className="text-xs font-semibold transition-colors"
          style={{ color: '#0EA5E9', cursor: 'pointer' }}
        >
          {showAdvanced ? '− Masquer' : '+ Options avancées'} (pénalités, intérêts moratoires)
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 rounded-xl p-3" style={{ background: '#F8FAFC' }}>
            <Field id="rg-jours" label="Jours de retard">
              <input id="rg-jours" type="number" min={0} className="input-dark"
                value={joursRetard} onChange={(e) => setJoursRetard(e.target.value)} />
            </Field>
            <Field id="rg-div" label="Diviseur pénalités" hint="1/3000 (CCAG-T)">
              <input id="rg-div" type="number" min={1} className="input-dark"
                value={diviseur} onChange={(e) => setDiviseur(e.target.value)} />
            </Field>
            <Field id="rg-bce" label="Taux BCE" hint="ex : 0.0415">
              <input id="rg-bce" type="number" min={0} step={0.0001} className="input-dark"
                value={tauxBce} onChange={(e) => setTauxBce(e.target.value)} />
            </Field>
            <Field id="rg-jourspay" label="Jours retard paiement">
              <input id="rg-jourspay" type="number" min={0} className="input-dark"
                value={joursPaiement} onChange={(e) => setJoursPaiement(e.target.value)} />
            </Field>
          </div>
        )}

        <button
          onClick={calculer} disabled={loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
          style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? <><Loader2 size={15} className="animate-spin" /> Calcul…</> : 'Calculer'}
        </button>

        {error && (
          <p className="text-xs font-medium" style={{ color: '#DC2626' }} role="alert">{error}</p>
        )}
      </div>

      {result && (
        <div className="mt-5 pt-5 space-y-4" style={{ borderTop: '1px solid #F1F5F9' }}>
          <div className="text-center rounded-xl p-4" style={{ background: '#F0F9FF', border: '1px solid #E0F2FE' }}>
            <p className="text-[11px] uppercase tracking-wide font-semibold text-ds-text-3">Montant TTC du marché</p>
            <p className="text-2xl font-bold mt-1" style={{ color: '#0F172A', fontFamily: F }}>
              {formatMontant(result.montant_ttc)}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #F1F5F9' }}>
            <table className="w-full text-sm">
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  {['Poste', 'Montant', 'Base', 'Détail'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wide px-3 py-2 text-ds-text-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#F1F5F9' }}>
                {result.postes.map((p, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5 font-medium text-ds-text">{p.poste}</td>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: '#0284C7' }}>{formatMontant(p.montant)}</td>
                    <td className="px-3 py-2.5 text-ds-text-3">{p.base}</td>
                    <td className="px-3 py-2.5 text-ds-text-2 text-xs">{p.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <AiTip
            tip={{
              id: 'rg-caution',
              variant: 'info',
              text: "La retenue de garantie peut être remplacée par une caution personnelle et solidaire ou une garantie à première demande, à votre initiative (art. 19 CCAG-Travaux / CCP R2191-36).",
            }}
            onDismiss={() => {}}
          />
          {result.avertissements.map((a, i) => (
            <AiTip key={i} tip={{ id: `rg-warn-${i}`, variant: 'warning', text: a }} onDismiss={() => {}} />
          ))}

          <div className="flex items-center gap-1.5 text-[11px] text-ds-text-3">
            <ShieldCheck size={12} style={{ color: '#94A3B8' }} />
            Calcul indicatif — l'assiette et les plafonds définitifs dépendent des clauses du CCAP.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Tools() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Calculator size={24} style={{ color: '#0EA5E9' }} />
        <div>
          <h1 className="text-2xl font-bold text-ds-text">Calculateurs</h1>
          <p className="text-sm text-ds-text-2">Outils d'aide à la décision — marchés publics. Calcul instantané, aucune donnée enregistrée.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <OabCalculator />
        <RetenueCalculator />
      </div>
    </div>
  )
}
