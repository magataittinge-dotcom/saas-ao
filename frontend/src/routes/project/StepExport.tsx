import { useMutation, useQuery } from '@tanstack/react-query'
import { FileDown, Archive, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { api } from '@/services/api'
import type { Project } from '@/types'

interface ExportSummary {
  compliance_total: number
  compliance_covered: number
  checklist_total: number
  checklist_present: number
  has_memoire: boolean
  has_dpgf: boolean
}

interface Props { project: Project }

export default function StepExport({ project }: Props) {
  const { data: summary } = useQuery({
    queryKey: ['export-summary', project.id],
    queryFn: async () => {
      const { data } = await api.get<ExportSummary>(`/projects/${project.id}/export/summary`)
      return data
    },
  })

  const { mutate: exportDocx, isPending: isExportingDocx } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/export/docx`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `memoire_technique_${project.name}.docx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    },
  })

  const { mutate: exportZip, isPending: isExportingZip } = useMutation({
    mutationFn: async () => {
      const response = await api.get(`/projects/${project.id}/export/zip`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `dossier_ao_${project.name}.zip`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    },
  })

  const checks = summary
    ? [
        {
          label: 'Compliance matrix',
          ok: summary.compliance_covered === summary.compliance_total,
          detail: `${summary.compliance_covered}/${summary.compliance_total} exigences couvertes`,
        },
        {
          label: 'Documents candidature',
          ok: summary.checklist_present === summary.checklist_total,
          detail: `${summary.checklist_present}/${summary.checklist_total} documents présents`,
        },
        { label: 'Mémoire technique', ok: summary.has_memoire, detail: summary.has_memoire ? 'Généré' : 'Non généré' },
        { label: 'DPGF',             ok: summary.has_dpgf,    detail: summary.has_dpgf    ? 'Présente' : 'Manquante' },
      ]
    : []

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ds-text">Étape 6 — Vérification Finale &amp; Export</h2>
        <p className="text-sm text-ds-text-2 mt-1">Récapitulatif avant soumission de votre dossier.</p>
      </div>

      {/* Summary checklist */}
      <div className="space-y-2">
        {checks.map(({ label, ok, detail }) => (
          <div
            key={label}
            className="flex items-center justify-between p-3 rounded-lg border transition-all"
            style={
              ok
                ? { background: 'rgba(16,185,129,0.07)', borderColor: 'rgba(16,185,129,0.20)' }
                : { background: 'rgba(239,68,68,0.07)',  borderColor: 'rgba(239,68,68,0.20)'  }
            }
          >
            <div className="flex items-center gap-3">
              {ok
                ? <CheckCircle2 size={18} className="shrink-0" style={{ color: '#10B981' }} />
                : <XCircle     size={18} className="shrink-0" style={{ color: '#EF4444' }} />
              }
              <span className="text-sm font-medium text-ds-text">{label}</span>
            </div>
            <span className="text-xs text-ds-text-2">{detail}</span>
          </div>
        ))}
      </div>

      {/* Export buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={() => exportDocx()}
          disabled={isExportingDocx}
          className="btn-primary flex items-center justify-center gap-2 flex-1 py-3 px-6"
        >
          {isExportingDocx ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
          Télécharger le mémoire (.docx)
        </button>

        <button
          onClick={() => exportZip()}
          disabled={isExportingZip}
          className="btn-glass flex items-center justify-center gap-2 flex-1 py-3 px-6 font-semibold"
        >
          {isExportingZip ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
          Dossier complet (.zip)
        </button>
      </div>
    </div>
  )
}
