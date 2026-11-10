// « Téléchargement » : d'abord le format du fichier et le bouton « Télécharger la fiche » (la seule action pleine
// de l'écran, toujours visible) ; puis le bordereau à personnaliser : logo, titre, sous-titre, contact, couleur d'accent,
// (les lignes libres sont du contenu : elles vivent dans « Ce qu'il y a dans la fiche »). Les champs s'enregistrent tout seuls (la page) :
// l'aperçu et le fichier partent de l'état enregistré. Composants du système partout ; le fichier du logo et la couleur
// passent par un bouton du système qui ouvre le sélecteur du navigateur (le contrôle natif ne se voit pas).
import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Bouton } from '@/components/ui/bouton'
import { GroupeRadio } from '@/components/ui/case'
import { Champ, GroupeChamp } from '@/components/ui/champ'
import { EntreeFichier } from '@/components/depot/EntreeFichier'
import { TitreSection } from '@/components/ui/page'
import { FORMATS_FICHE } from '@/lib/fichePage'
import type { FicheBordereau } from '@/lib/fiche'
import type { FormatFiche } from '@/lib/apercuFiche'

interface Props {
  bordereau: FicheBordereau
  onChange: (patch: Partial<FicheBordereau>) => void
  logoSrc: string | null
  logoEnCours: boolean
  onLogo: (fichier: File) => void
  onRetirerLogo: () => void
  format: FormatFiche
  onFormat: (f: FormatFiche) => void
  /** Raison pour laquelle le PDF n'est pas offert (LibreOffice indisponible) ; null : le PDF est offert. */
  pdfIndisponible: string | null
  onTelecharger: () => void
  enTelechargement: boolean
}

const ETIQUETTE = 'text-xs font-medium text-fg-2'

export default function ZoneBordereau(p: Props) {
  const { bordereau, onChange } = p
  const [survol, setSurvol] = useState(false)
  const fichierLogo = useRef<HTMLInputElement>(null)
  const nuancier = useRef<HTMLInputElement>(null)
  const couleur = bordereau.couleur.toLowerCase()
  const echantillon = { backgroundColor: couleur }          // la couleur choisie par l'utilisateur : une valeur calculée
  const formats = FORMATS_FICHE.filter((f) => !(f.id === 'pdf' && p.pdfIndisponible !== null))
  const nomFormat = FORMATS_FICHE.find((f) => f.id === p.format)?.libelle ?? ''

  const aLaDepose = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setSurvol(false)
    const f = e.dataTransfer.files?.[0]
    if (f) p.onLogo(f)
  }

  return (
    <section aria-labelledby="zone-bordereau" data-zone="bordereau" className="min-w-0">
      <TitreSection id="zone-bordereau">Téléchargement</TitreSection>
      <div className="grid gap-5">
      <div className="grid gap-1.5" data-formats="">
        <span className={ETIQUETTE}>Format du fichier</span>
        <GroupeRadio
          libelle="Format du fichier" valeur={p.format} onChange={p.onFormat}
          options={formats.map((f) => ({ valeur: f.id, libelle: f.libelle, aide: f.explication }))}
        />
        {p.pdfIndisponible !== null && <p className="text-xs text-fg-3" data-pdf-indisponible="">PDF · {p.pdfIndisponible}</p>}
      </div>

      <Bouton variante="principal" large enCours={p.enTelechargement} libelleEnCours="Préparation de la fiche…" onClick={p.onTelecharger} data-telecharger="">
        <Download aria-hidden />Télécharger la fiche<span className="font-normal">· {nomFormat}</span>
      </Bouton>

      <h3 className="border-t border-bord pt-5 text-sm font-semibold text-fg">Personnaliser le bordereau</h3>

      <div className="grid gap-4">
        <GroupeChamp libelle="Titre">
          <Champ maxLength={120} value={bordereau.titre} onChange={(e) => onChange({ titre: e.target.value })} />
        </GroupeChamp>
        <GroupeChamp libelle="Sous-titre">
          <Champ maxLength={200} value={bordereau.sous_titre} onChange={(e) => onChange({ sous_titre: e.target.value })} />
        </GroupeChamp>
        <GroupeChamp libelle="Contact">
          <Champ maxLength={200} placeholder="E-mail, téléphone" value={bordereau.contact} onChange={(e) => onChange({ contact: e.target.value })} />
        </GroupeChamp>

        {/* Logo et couleur, côte à côte : chacun un bouton du système qui ouvre le sélecteur du navigateur. Le logo reçoit aussi
            une image glissée (trait d'accent au survol d'un fichier seulement). */}
        <div className="grid gap-1.5">
          <div className="grid grid-cols-2 gap-4">
            <div
              data-depot-logo=""
              onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
              onDragLeave={() => setSurvol(false)}
              onDrop={aLaDepose}
              className={cn('grid content-start justify-items-start gap-1.5 rounded-lg', survol && 'bg-accent-tint outline-dashed outline-2 outline-offset-4 outline-accent-ring')}
            >
              <span className={ETIQUETTE}>Logo</span>
              {p.logoSrc && <img src={p.logoSrc} alt="Logo actuel de la fiche" className="max-h-11 max-w-28 rounded-md border border-bord bg-surface-0 object-contain p-1" />}
              <Bouton variante="secondaire" onClick={() => fichierLogo.current?.click()} enCours={p.logoEnCours} libelleEnCours="Envoi…">
                {p.logoSrc ? 'Changer' : 'Choisir un logo'}
              </Bouton>
              {p.logoSrc && <Bouton variante="lien" className="text-sm" onClick={p.onRetirerLogo}>Retirer le logo</Bouton>}
              <EntreeFichier
                ref={fichierLogo} accept="image/png,image/jpeg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onLogo(f); e.target.value = '' }}
              />
            </div>
            <div className="relative grid content-start justify-items-start gap-1.5" data-couleur="">
              <span className={ETIQUETTE}>Couleur d’accent</span>
              <Bouton variante="secondaire" aria-label={`Changer la couleur d’accent (${couleur})`} onClick={() => nuancier.current?.click()}>
                <span aria-hidden className="size-5 shrink-0 rounded-md border border-bord" style={echantillon} />
                <span className="chiffres font-medium">{couleur}</span>
              </Bouton>
              <Champ
                ref={nuancier} type="color" value={couleur} tabIndex={-1} aria-hidden="true" className="sr-only bottom-0 left-0 size-px border-0 p-0"
                onChange={(e) => onChange({ couleur: e.target.value })}
              />
            </div>
          </div>
          <p className="text-xs text-fg-3">Logo : PNG ou JPEG, 2 Mo au plus. Vous pouvez aussi glisser l’image sur le bouton.</p>
        </div>
      </div>
      </div>
    </section>
  )
}
