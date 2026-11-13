import ZoneDepotAO from '@/components/onboarding/ZoneDepotAO'
import { TitreDepot } from '@/components/depot/ZoneDepot'
import { Sigle } from '@/components/common/Sigle'
import { Page } from '@/components/ui/page'

// /projects/new : un seul geste, déposer le dossier de l'acheteur. Pas de formulaire « Nom du projet » : le nom de l'AO est
// tiré du nom du fichier et se modifie ensuite (S2). Pas de lien « Retour » : le chemin « Mes AO / Nouvel AO » de la barre
// du haut le fait déjà.
export default function NewProject() {
  return (
    <Page
      titre="Nouvel appel d’offres"
      sousTitre="Déposez le dossier reçu de l’acheteur : Synorix le range, le lit et vous dit ce que le marché demande."
    >
      <ZoneDepotAO
        geste
        suite
        titre={<TitreDepot />}
        className="md:min-h-80"
        precision={<>Le <Sigle code="DCE" /> entier en ZIP, tel que vous l’avez téléchargé, ou plusieurs fichiers à la fois. Le nom de l’AO vient du fichier ; vous pourrez le modifier ensuite.</>}
      />
    </Page>
  )
}
