// Zone 3, « Bordereau et téléchargement » : logo (zone de dépôt visible), titre, sous-titre, contact, couleur d'accent, lignes
// libres, choix du format avec son explication, et le bouton « Télécharger la fiche ». Les champs s'enregistrent tout seuls
// (la page) : l'aperçu et le fichier partent de l'état enregistré.
import { useState } from 'react'
import { Download, ImagePlus, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { classeChamp } from '@/components/ui/input'
import { FORMATS_FICHE } from '@/lib/fichePage'
import { MAX_LIGNES_LIBRES, type FicheBordereau, type FicheSection } from '@/lib/fiche'
import type { FormatFiche } from '@/lib/apercuFiche'

interface Props {
  bordereau: FicheBordereau
  onChange: (patch: Partial<FicheBordereau>) => void
  logoSrc: string | null
  logoEnCours: boolean
  onLogo: (fichier: File) => void
  onRetirerLogo: () => void
  sections: Pick<FicheSection, 'id' | 'titre'>[]
  format: FormatFiche
  onFormat: (f: FormatFiche) => void
  /** Raison pour laquelle le PDF est grisé (LibreOffice indisponible) ; null : le PDF est offert. */
  pdfIndisponible: string | null
  onTelecharger: () => void
  enTelechargement: boolean
}

const ETIQUETTE = 'mb-1 block text-sm font-medium text-fg-2'
const CHAMP = 'h-11 text-base md:text-sm'

export default function ZoneBordereau(p: Props) {
  const { bordereau, onChange } = p
  const libres = bordereau.lignes_libres
  const majLigne = (i: number, patch: Partial<(typeof libres)[number]>) =>
    onChange({ lignes_libres: libres.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const [survol, setSurvol] = useState(false)
  const nomFormat = FORMATS_FICHE.find((f) => f.id === p.format)?.libelle ?? ''

  return (
    <section aria-labelledby="zone-bordereau" data-zone="bordereau" className="min-w-0 space-y-5">
      <h2 id="zone-bordereau" className="font-display text-h6 text-fg">Bordereau et téléchargement</h2>

      <div>
        <span className={ETIQUETTE} id="etiquette-logo">Logo</span>
        <label
          data-depot-logo aria-labelledby="etiquette-logo"
          onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f) p.onLogo(f) }}
          className={`flex min-h-[5.5rem] cursor-pointer items-center gap-3 rounded-md border-2 border-dashed px-3 py-3 text-sm transition-colors duration-base has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${survol ? 'border-accent-ring bg-accent-tint' : 'border-input bg-surface-0 hover:border-fg-3'}`}
        >
          {p.logoSrc ? (
            <img src={p.logoSrc} alt="Logo actuel de la fiche" className="max-h-14 max-w-[7rem] shrink-0 rounded-xs bg-white object-contain p-1" />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-surface-1 text-fg-2"><ImagePlus size={20} aria-hidden /></span>
          )}
          <span className="min-w-0">
            <span className="block font-medium text-fg">
              {p.logoEnCours ? 'Envoi du logo…' : p.logoSrc ? 'Déposer un autre logo' : 'Déposer votre logo ici'}
            </span>
            <span className="block text-xs text-fg-2">ou cliquer pour le choisir · PNG ou JPEG, 2 Mo au plus</span>
          </span>
          <input
            type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Logo de la fiche (PNG ou JPEG, 2 Mo au plus)"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onLogo(f); e.target.value = '' }}
          />
        </label>
        {p.logoSrc && (
          <button type="button" onClick={p.onRetirerLogo} className="mt-1 inline-flex min-h-11 items-center rounded-xs text-sm font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline">
            Retirer le logo
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="fiche-titre" className={ETIQUETTE}>Titre</label>
          <Input id="fiche-titre" className={CHAMP} maxLength={120} value={bordereau.titre} onChange={(e) => onChange({ titre: e.target.value })} />
        </div>
        <div>
          <label htmlFor="fiche-sous-titre" className={ETIQUETTE}>Sous-titre</label>
          <Input id="fiche-sous-titre" className={CHAMP} maxLength={200} value={bordereau.sous_titre} onChange={(e) => onChange({ sous_titre: e.target.value })} />
        </div>
        <div>
          <label htmlFor="fiche-contact" className={ETIQUETTE}>Contact</label>
          <Input id="fiche-contact" className={CHAMP} maxLength={200} placeholder="E-mail · téléphone" value={bordereau.contact} onChange={(e) => onChange({ contact: e.target.value })} />
        </div>
        <div>
          <label htmlFor="fiche-couleur" className={ETIQUETTE}>Couleur d'accent</label>
          <span className="flex items-center gap-3">
            <input
              id="fiche-couleur" type="color" value={bordereau.couleur.toLowerCase()}
              onChange={(e) => onChange({ couleur: e.target.value })}
              className="h-11 w-16 cursor-pointer rounded-md border border-input bg-surface-0 p-1"
            />
            <span className="font-mono text-sm text-fg-2">{bordereau.couleur.toLowerCase()}</span>
          </span>
        </div>
      </div>

      <fieldset className="space-y-2" data-formats>
        <legend className={ETIQUETTE}>Format du fichier</legend>
        {FORMATS_FICHE.map((f) => {
          const grise = f.id === 'pdf' && p.pdfIndisponible !== null
          const choisi = p.format === f.id
          return (
            <label
              key={f.id} data-format={f.id} aria-disabled={grise || undefined}
              className={`flex min-h-11 items-start gap-3 rounded-md border px-3 py-2 transition-colors duration-base has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${grise ? 'cursor-not-allowed border-bord-2 bg-surface-1 text-fg-disabled' : choisi ? 'cursor-pointer border-accent-ring bg-accent-tint' : 'cursor-pointer border-input bg-surface-0 hover:bg-surface-1'}`}
            >
              <input
                type="radio" name="format-fiche" value={f.id} checked={choisi} disabled={grise}
                onChange={() => p.onFormat(f.id)} className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${grise ? '' : 'text-fg'}`}>{f.libelle}</span>
                <span className={`block text-sm ${grise ? '' : 'text-fg-2'}`}>
                  {grise ? p.pdfIndisponible : f.explication}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <div className="space-y-2" data-lignes-libres>
        <h3 className="text-sm font-semibold text-fg">Lignes libres</h3>
        <p className="text-sm text-fg-2">Ajoutez une ligne de texte dans une section de la fiche.</p>
        {libres.map((l, i) => (
          <div key={i} className="space-y-2 rounded-md border border-bord-2 bg-surface-0 p-2.5" data-ligne-libre>
            <div className="flex items-center gap-2">
              <select
                aria-label={`Section de la ligne libre ${i + 1}`} value={l.section} onChange={(e) => majLigne(i, { section: e.target.value })}
                className={`${classeChamp} h-11 min-w-0 flex-1 py-1`}
              >
                {p.sections.map((s) => <option key={s.id} value={s.id}>{s.id} {s.titre}</option>)}
              </select>
              <button
                type="button" aria-label={`Retirer la ligne libre ${i + 1}`}
                onClick={() => onChange({ lignes_libres: libres.filter((_, j) => j !== i) })}
                className="grid size-11 shrink-0 place-items-center rounded-md text-fg-2 hover:bg-surface-1 hover:text-fg"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <Input aria-label={`Libellé de la ligne libre ${i + 1}`} className={CHAMP} maxLength={80} placeholder="Libellé" value={l.libelle} onChange={(e) => majLigne(i, { libelle: e.target.value })} />
            <Input aria-label={`Valeur de la ligne libre ${i + 1}`} className={CHAMP} maxLength={300} placeholder="Texte" value={l.valeur} onChange={(e) => majLigne(i, { valeur: e.target.value })} />
          </div>
        ))}
        <button
          type="button" disabled={libres.length >= MAX_LIGNES_LIBRES || p.sections.length === 0}
          onClick={() => onChange({ lignes_libres: [...libres, { section: p.sections[0]?.id ?? '01', libelle: '', valeur: '' }] })}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xs text-sm font-medium text-accent-text hover:underline disabled:opacity-50"
        >
          <Plus size={15} aria-hidden /> Ajouter une ligne
        </button>
      </div>

      <Button
        variant="signature" size="lg" className="h-12 w-full" disabled={p.enTelechargement} aria-busy={p.enTelechargement} onClick={p.onTelecharger} data-telecharger
      >
        {p.enTelechargement ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Download aria-hidden />}
        {p.enTelechargement ? 'Préparation de la fiche…' : <>Télécharger la fiche<span className="font-normal opacity-90">· {nomFormat}</span></>}
      </Button>
    </section>
  )
}
