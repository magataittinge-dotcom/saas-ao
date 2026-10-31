import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ZoneDepotAO from '@/components/onboarding/ZoneDepotAO'

// /projects/new : l'écran de dépôt. Plus de formulaire « Nom du projet » : on dépose le dossier de l'acheteur,
// le nom de l'AO est tiré du nom du fichier et se modifie ensuite (S2).
export default function NewProject() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-xl animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-1.5 rounded-xs text-sm text-fg-3 transition-colors duration-base ease-lien hover:text-fg [@media(pointer:coarse)]:min-h-11"
      >
        <ArrowLeft size={15} aria-hidden />
        Retour
      </button>

      <h1 className="font-display text-h5 leading-tight text-fg">Nouvel appel d&apos;offres</h1>
      <p className="mb-6 mt-1.5 text-[15px] text-fg-2">
        Déposez le dossier reçu de l&apos;acheteur : Synorix en tire le nom de l&apos;AO, que vous pourrez modifier ensuite.
      </p>

      <ZoneDepotAO
        titre="Déposez le dossier de l'acheteur (DCE)"
        precision="ZIP complet ou PDF · le nom de l'AO vient du nom du fichier"
      />
    </div>
  )
}
