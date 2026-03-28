import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useCreateProject } from '@/hooks/useProject'

const schema = z.object({
  name:           z.string().min(3, 'Nom du projet requis'),
  maitre_ouvrage: z.string().optional(),
  deadline:       z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function NewProject() {
  const navigate = useNavigate()
  const { mutate: createProject, isPending } = useCreateProject()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data: FormData) => {
    const payload = {
      name: data.name,
      ...(data.maitre_ouvrage?.trim() && { maitre_ouvrage: data.maitre_ouvrage.trim() }),
      ...(data.deadline && { deadline: data.deadline }),
    }
    createProject(payload, {
      onSuccess: (project) => navigate(`/projects/${project.id}/upload`),
    })
  }

  return (
    <div className="max-w-xl mx-auto animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ds-text-2 hover:text-ds-text mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Retour
      </button>

      <div className="glass-card p-8">
        <h1 className="text-ds-text mb-2">Nouvel appel d&apos;offres</h1>
        <p className="text-ds-text-2 text-sm mb-8">
          Seulement quelques informations pour commencer. Vous pourrez tout compléter ensuite.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-ds-text mb-1.5">
              Nom du projet <span className="text-ds-danger">*</span>
            </label>
            <input
              {...register('name')}
              className="input-dark"
              placeholder="Ex: Construction 42 logements — Charleville"
            />
            {errors.name && <p className="text-ds-danger text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-ds-text mb-1.5">
              Maître d&apos;ouvrage
              <span className="text-ds-text-3 font-normal ml-1">(optionnel)</span>
            </label>
            <input
              {...register('maitre_ouvrage')}
              className="input-dark"
              placeholder="Ex: Commune de Charleville-Mézières"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ds-text mb-1.5">
              Date limite de réponse
              <span className="text-ds-text-3 font-normal ml-1">(optionnel)</span>
            </label>
            <input
              {...register('deadline')}
              type="date"
              className="input-dark"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary w-full py-3 mt-2"
          >
            {isPending ? 'Création...' : 'Créer le projet →'}
          </button>
        </form>
      </div>
    </div>
  )
}
