// Page « Fiche à télécharger » : à quoi sert chaque fiche, l'état de chacune de ses sections, les formats offerts.
import type { FicheDonnees, FicheSection, LigneLibre, RubriqueFiche } from '@/lib/fiche'
import { aUneValeur } from '@/lib/fiche'
import type { FormatFiche } from '@/lib/apercuFiche'
import { CHAMP_DE_SECTION, CHAMP_DES_REFERENCES, lienChamp } from '@/lib/entreprise/champsFiche'

/** Une phrase par fiche, dite comme un patron du BTP la comprend : à qui elle se remet, pourquoi, et qu'elle se joint telle quelle. */
export const A_QUOI_SERT: Record<RubriqueFiche, string> = {
  identite:
    "Avant d’étudier une candidature, un acheteur veut savoir qui vous êtes : raison sociale, SIRET, siège, dirigeant, chiffres et activités. Cette fiche le dit en une page et se joint telle quelle à votre dossier.",
  moyens:
    "Les grandes entreprises demandent vos moyens et vos références avant de vous confier un chantier en sous-traitance. Cette fiche se remet telle quelle.",
  certifications:
    "Un acheteur public regarde d’abord vos qualifications, vos assurances et les chantiers que vous avez déjà réalisés. Cette fiche les réunit et se joint telle quelle à une candidature.",
}

export const FORMATS_FICHE: { id: FormatFiche; libelle: string; explication: string }[] = [
  { id: 'pdf', libelle: 'PDF', explication: 'à envoyer tel quel' },
  { id: 'docx', libelle: 'Word', explication: 'pour modifier avant d’envoyer' },
  { id: 'xlsx', libelle: 'Excel', explication: 'le tableau, pour trier ou compléter' },
]

export type EtatSection = 'prete' | 'a_renseigner'
export const LIBELLE_ETAT: Record<EtatSection, string> = { prete: 'Prête', a_renseigner: 'À renseigner' }

export interface LigneContenu {
  cle: string
  numero: string
  titre: string
  etat: EtatSection
  /** Adresse de Mon entreprise qui ouvre le bon champ. */
  lien: string
}

/** Une section est prête quand elle imprime au moins une ligne (donnée, texte ou ligne libre de l'utilisateur). */
export function sectionPrete(section: FicheSection, libres: LigneLibre[]): boolean {
  return !section.vide || (section.texte ?? '').trim() !== ''
    || libres.some((l) => l.section === section.id && l.libelle.trim() !== '' && aUneValeur(l))
}

/** « Ce qu'il y a dans la fiche » : la liste des sections, avec leur état et le lien vers le champ qui les alimente. */
export function contenuDeLaFiche(rubrique: RubriqueFiche, donnees: FicheDonnees, libres: LigneLibre[]): LigneContenu[] {
  const lignes: LigneContenu[] = []
  if (rubrique === 'certifications') {
    lignes.push({
      cle: 'references', numero: '', titre: 'Références chantiers',
      etat: (donnees.references?.lignes.length ?? 0) > 0 ? 'prete' : 'a_renseigner',
      lien: lienChamp(CHAMP_DES_REFERENCES, rubrique),
    })
  }
  for (const s of donnees.sections) {
    lignes.push({
      cle: s.id, numero: s.id, titre: s.titre, etat: sectionPrete(s, libres) ? 'prete' : 'a_renseigner',
      lien: lienChamp(CHAMP_DE_SECTION[rubrique][s.id], rubrique),
    })
  }
  return lignes
}
