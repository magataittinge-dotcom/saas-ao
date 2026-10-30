import { type ReactNode, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, Briefcase, Calendar, User, AlertCircle } from 'lucide-react'
import { useCreateProject } from '@/hooks/useProject'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const schema = z.object({
  name:           z.string().min(3, 'Nom du projet requis'),
  maitre_ouvrage: z.string().optional(),
  deadline:       z.string().optional(),
})

type FormData = z.infer<typeof schema>

function FieldGroup({ id, label, hint, error, children }: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center justify-between text-sm font-medium text-fg">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-fg-3">{hint}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-erreur`} role="alert" className="flex items-center gap-1 text-xs text-danger">
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
    <div className="mx-auto max-w-lg animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-1.5 rounded-xs text-sm text-fg-3 transition-colors duration-base ease-lien hover:text-fg [@media(pointer:coarse)]:min-h-11"
      >
        <ArrowLeft size={15} aria-hidden />
        Retour
      </button>

      <Card className="overflow-hidden shadow-card">
        {/* En-tête de la carte */}
        <div className="border-b border-bord px-8 pb-6 pt-8">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-tint">
              <Briefcase size={18} className="text-accent-text" aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-h6 leading-tight text-fg">Nouvel appel d&apos;offres</h1>
              <p className="mt-0.5 text-sm text-fg-2">Remplissez les informations de base pour démarrer</p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <div className="px-8 py-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <FieldGroup
              id="nom-projet"
              label="Nom du projet *"
              error={errors.name?.message}
            >
              <Input
                id="nom-projet"
                {...register('name')}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'nom-projet-erreur' : undefined}
                className="py-2.5"
                placeholder="Ex : Construction 42 logements — Charleville"
                autoFocus
              />
            </FieldGroup>

            <FieldGroup
              id="maitre-ouvrage"
              label="Maître d'ouvrage"
              hint="optionnel"
            >
              <div className="relative">
                <User
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                  aria-hidden
                />
                <Input
                  id="maitre-ouvrage"
                  {...register('maitre_ouvrage')}
                  className="py-2.5 pl-9"
                  placeholder="Ex : Commune de Charleville-Mézières"
                />
              </div>
            </FieldGroup>

            <FieldGroup
              id="date-limite"
              label="Date limite de réponse"
              hint="optionnel"
            >
              <div className="relative">
                <Calendar
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                  aria-hidden
                />
                <Input
                  id="date-limite"
                  {...register('deadline')}
                  type="date"
                  className="py-2.5 pl-9"
                />
              </div>
            </FieldGroup>

            {apiError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>{apiError}</span>
              </div>
            )}

            <div className="pt-2">
              <Button type="submit" disabled={isPending} size="lg" className="w-full">
                {isPending ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-accent-on/40 border-t-accent-on" aria-hidden />
                    Création en cours…
                  </>
                ) : (
                  'Créer le projet →'
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-fg-3">
                Vous déposerez les documents du DCE à l&apos;étape suivante
              </p>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
