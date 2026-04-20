import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, Briefcase, Calendar, User, AlertCircle } from 'lucide-react'
import { useCreateProject } from '@/hooks/useProject'

const schema = z.object({
  name:           z.string().min(3, 'Nom du projet requis'),
  maitre_ouvrage: z.string().optional(),
  deadline:       z.string().optional(),
})

type FormData = z.infer<typeof schema>

function FieldGroup({ label, hint, error, children }: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between text-sm font-medium text-ds-text">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-ds-text-3">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs flex items-center gap-1 text-ds-danger-light">
          {error}
        </p>
      )}
    </div>
  )
}

export default function NewProject() {
  const navigate = useNavigate()
  const { mutate: createProject, isPending } = useCreateProject()
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data: FormData) => {
    setApiError(null)
    const payload = {
      name: data.name,
      ...(data.maitre_ouvrage?.trim() && { maitre_ouvrage: data.maitre_ouvrage.trim() }),
      ...(data.deadline && { deadline: data.deadline }),
    }
    createProject(payload, {
      onSuccess: (project) => navigate(`/projects/${project.id}/upload`),
      onError: (err) => {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.detail ?? err.message)
          : 'Erreur lors de la création du projet'
        setApiError(typeof msg === 'string' ? msg : JSON.stringify(msg))
      },
    })
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ds-text-3 hover:text-ds-text mb-6 transition-all duration-200"
      >
        <ArrowLeft size={15} />
        Retour
      </button>

      <div
        className="glass-card overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(14,165,233,0.06), 0 24px 48px rgba(0,0,0,0.40)' }}
      >
        {/* Card header */}
        <div
          className="px-8 pt-8 pb-6"
          style={{ borderBottom: '1px solid rgba(14,165,233,0.08)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(0,212,170,0.10))',
                border: '1px solid rgba(14,165,233,0.20)',
              }}
            >
              <Briefcase size={18} className="text-ds-blue" />
            </div>
            <div>
              <h1 className="text-ds-text leading-tight">Nouvel appel d&apos;offres</h1>
              <p className="text-xs text-ds-text-3 mt-0.5">Remplissez les informations de base pour démarrer</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-8 py-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <FieldGroup
              label="Nom du projet *"
              error={errors.name?.message}
            >
              <input
                {...register('name')}
                className="glass-input w-full py-2.5 text-sm"
                placeholder="Ex : Construction 42 logements — Charleville"
                autoFocus
              />
            </FieldGroup>

            <FieldGroup
              label="Maître d'ouvrage"
              hint="optionnel"
            >
              <div className="relative">
                <User
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-ds-text-3"
                />
                <input
                  {...register('maitre_ouvrage')}
                  className="glass-input w-full py-2.5 text-sm pl-9"
                  placeholder="Ex : Commune de Charleville-Mézières"
                />
              </div>
            </FieldGroup>

            <FieldGroup
              label="Date limite de réponse"
              hint="optionnel"
            >
              <div className="relative">
                <Calendar
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-ds-text-3"
                />
                <input
                  {...register('deadline')}
                  type="date"
                  className="glass-input w-full py-2.5 text-sm pl-9"
                />
              </div>
            </FieldGroup>

            {apiError && (
              <div
                className="flex items-start gap-2 p-3 rounded-lg text-sm text-ds-danger-light"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                {isPending ? (
                  <>
                    <span
                      className="w-4 h-4 rounded-full border-2 border-transparent animate-spin"
                      style={{ borderTopColor: 'rgba(255,255,255,0.8)' }}
                    />
                    Création en cours…
                  </>
                ) : (
                  'Créer le projet →'
                )}
              </button>
              <p className="text-xs text-center text-ds-text-3 mt-3">
                Vous pourrez uploader les documents DCE à l&apos;étape suivante
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
