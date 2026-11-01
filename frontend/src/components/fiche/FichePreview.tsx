// Aperçu d'une fiche « Mon entreprise » : la feuille que le serveur imprime en PDF ou en Word, même structure et
// mêmes libellés — bandeau (logo à gauche, titre en capitales espacées, sous-titre, contact), ligne d'identité,
// quatre tuiles, sections numérotées en deux colonnes, tableau des références avec sa ligne TOTAL, pied de page.
// En mode édition, le bordereau se modifie sur place : logo, titre, sous-titre, contact, couleur d'accent, lignes libres.
// La feuille est un papier : ses couleurs viennent de variables --f-* posées par `variablesFiche`, jamais des
// jetons de thème (le PDF imprimé est le même en clair et en nuit).
import { Link } from 'react-router-dom'
import { ImagePlus, Plus, X } from 'lucide-react'
import {
  INFOBULLE_ABREGE, INTERVENTIONS, MAX_LIGNES_LIBRES, VIDE_SECTION, estAbrege, lignesDeSection, pageEstimee, tuilesAffichees, variablesFiche,
  type FicheBordereau, type FicheDonnees, type FicheReference, type FicheSection, type LigneLibre, type PaletteFiche,
} from '@/lib/fiche'

export interface EditionFiche {
  onChange: (patch: Partial<FicheBordereau>) => void
  onLogo: (fichier: File) => void
  onRetirerLogo: () => void
  logoEnCours?: boolean
}

interface Props {
  donnees: FicheDonnees
  bordereau: FicheBordereau
  palette: PaletteFiche
  /** Adresse du logo (déjà signée et préfixée) ; null : le nom de l'entreprise tient lieu de logo. */
  logoSrc?: string | null
  /** Présent : le bordereau se modifie sur place. Absent : aperçu seul. */
  edition?: EditionFiche
}

const CAPITALES = 'uppercase tracking-[0.18em]'

/** Un texte du profil ; abrégé par le serveur (« … »), il porte l'infobulle « Texte abrégé, modifiable dans Mon entreprise ». */
function Texte({ t, className }: { t: string; className?: string }) {
  const abrege = estAbrege(t)
  return <span className={className} title={abrege ? INFOBULLE_ABREGE : undefined} data-abrege={abrege ? '' : undefined}>{t}</span>
}
const CHAMP = 'w-full rounded-xs border-b border-dashed border-current bg-transparent px-1 py-0.5 outline-offset-2 placeholder:text-current placeholder:opacity-60'

export default function FichePreview({ donnees, bordereau, palette, logoSrc, edition }: Props) {
  const { societe } = donnees
  return (
    <article
      aria-label="Aperçu de la fiche"
      data-rubrique={donnees.rubrique}
      style={variablesFiche(palette) as React.CSSProperties}
      className="mx-auto w-full max-w-[860px] overflow-hidden rounded-sm bg-[var(--f-papier)] text-[length:13px] leading-snug text-[color:var(--f-texte)] shadow-card"
    >
      <Banniere donnees={donnees} bordereau={bordereau} logoSrc={logoSrc} edition={edition} />
      <div className="px-5 pb-4 pt-3 sm:px-7">
        <LigneIdentite lignes={donnees.identite_ligne} />
        <Tuiles tuiles={donnees.tuiles} />
        {donnees.lignes_cles.length > 0 && (
          <dl className="mt-3 grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-3 gap-y-1.5 sm:grid-cols-[9.5rem_1fr]" data-lignes-cles>
            {donnees.lignes_cles.map((l) => (
              <div key={l.libelle} className="contents">
                <dt className={`${CAPITALES} pt-0.5 text-[12px] font-bold text-[color:var(--f-accent-texte)] tracking-[0.08em]`}>{l.libelle}</dt>
                <dd className="text-[13px]"><Texte t={l.valeur} /></dd>
              </div>
            ))}
          </dl>
        )}
        {donnees.references && <TableauReferences tableau={donnees.references} />}
        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2" data-sections>
          {donnees.sections.map((s) => (
            <Section key={s.id} section={s} libres={bordereau.lignes_libres} edition={edition} />
          ))}
        </div>
      </div>
      <footer className="mx-5 border-t border-[color:var(--f-filet)] py-2 text-center text-[12px] text-[color:var(--f-discret)] sm:mx-7">
        <p>{donnees.pied || societe.nom}</p>
        <p className="mt-0.5 opacity-80">{pageEstimee(donnees)}</p>
      </footer>
    </article>
  )
}

// ─── Bandeau ───────────────────────────────────────────────────────────────────

function Banniere({ donnees, bordereau, logoSrc, edition }: Pick<Props, 'donnees' | 'bordereau' | 'logoSrc' | 'edition'>) {
  const { societe } = donnees
  return (
    <header className="border-b-[3px] border-[color:var(--f-accent)]">
      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="flex min-h-[4.5rem] flex-col items-start justify-center gap-1.5 bg-[var(--f-papier)] px-5 py-3 sm:w-[28%] sm:px-6" data-logo>
          {logoSrc ? (
            <img src={logoSrc} alt={`Logo de ${societe.nom}`} className="max-h-14 max-w-full object-contain" />
          ) : (
            <span className="text-[15px] font-bold leading-tight text-[color:var(--f-bandeau)]">{societe.nom}</span>
          )}
          {edition && (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-xs font-medium text-[color:var(--f-accent-texte)] underline-offset-2 hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center">
                <ImagePlus size={14} aria-hidden />
                {edition.logoEnCours ? 'Envoi du logo…' : logoSrc ? 'Changer le logo' : 'Ajouter un logo'}
                <input
                  type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Logo de la fiche (PNG ou JPEG, 2 Mo au plus)"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) edition.onLogo(f); e.target.value = '' }}
                />
              </label>
              {logoSrc && (
                <button type="button" onClick={edition.onRetirerLogo} className="rounded-xs text-[color:var(--f-discret)] underline-offset-2 hover:underline [@media(pointer:coarse)]:min-h-11">
                  Retirer
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1 bg-[var(--f-bandeau)] px-5 py-4 text-[color:var(--f-bandeau-texte)] sm:items-end sm:px-6 sm:text-right">
          {edition ? (
            <>
              <input
                aria-label="Titre de la fiche" maxLength={120} value={bordereau.titre}
                onChange={(e) => edition.onChange({ titre: e.target.value })}
                className={`${CHAMP} ${CAPITALES} text-[17px] font-bold sm:text-right`}
              />
              <input
                aria-label="Sous-titre" maxLength={200} value={bordereau.sous_titre}
                onChange={(e) => edition.onChange({ sous_titre: e.target.value })}
                className={`${CHAMP} text-[12px] sm:text-right`}
              />
              <input
                aria-label="Contact" maxLength={200} value={bordereau.contact} placeholder="E-mail · téléphone"
                onChange={(e) => edition.onChange({ contact: e.target.value })}
                className={`${CHAMP} text-[12px] sm:text-right`}
              />
              <label className="mt-1 inline-flex items-center gap-2 text-[12px] sm:justify-end">
                Couleur d'accent
                <input
                  type="color" aria-label="Couleur d'accent" value={bordereau.couleur.toLowerCase()}
                  onChange={(e) => edition.onChange({ couleur: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded-xs border border-current bg-transparent p-0.5 [@media(pointer:coarse)]:h-11"
                />
              </label>
            </>
          ) : (
            <>
              <h2 className={`${CAPITALES} text-[17px] font-bold leading-tight sm:text-[19px]`}>{bordereau.titre}</h2>
              {bordereau.sous_titre && <p className="text-[12px] opacity-90">{bordereau.sous_titre}</p>}
              {bordereau.contact && <p className="text-[12px] opacity-90">{bordereau.contact}</p>}
            </>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── Identité, tuiles ──────────────────────────────────────────────────────────

function LigneIdentite({ lignes }: { lignes: FicheDonnees['identite_ligne'] }) {
  if (lignes.length === 0) return null
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[color:var(--f-filet)] pb-3 text-[12.5px]" data-identite>
      {lignes.map((l) => (
        <span key={l.libelle}>
          <span className={`${CAPITALES} mr-1.5 text-[12px] font-bold tracking-[0.06em] text-[color:var(--f-discret)]`}>{l.libelle}</span>
          <strong className="font-bold text-[color:var(--f-encre)]">{l.valeur}</strong>
        </span>
      ))}
    </p>
  )
}

function Tuiles({ tuiles }: { tuiles: FicheDonnees['tuiles'] }) {
  const visibles = tuilesAffichees(tuiles)
  if (visibles.length === 0) return null
  return (
    <ul className={`mt-3 grid grid-cols-2 gap-2 ${visibles.length >= 4 ? 'sm:grid-cols-4' : visibles.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`} data-tuiles>
      {visibles.map((t) => (
        <li key={t.libelle} className="border-l-[3px] border-[color:var(--f-accent)] bg-[var(--f-pale)] px-3 py-2">
          <p className="text-[22px] font-bold leading-none text-[color:var(--f-accent-texte)] [overflow-wrap:anywhere]">{t.valeur}</p>
          <p className={`${CAPITALES} mt-1 text-[12px] font-bold tracking-[0.06em] text-[color:var(--f-discret)]`}>{t.libelle}</p>
        </li>
      ))}
    </ul>
  )
}

// ─── Sections numérotées ───────────────────────────────────────────────────────

function Section({ section, libres, edition }: { section: FicheSection; libres: LigneLibre[]; edition?: EditionFiche }) {
  const lignes = edition ? section.lignes : lignesDeSection(section, libres)
  const rien = lignes.length === 0 && !section.texte && !(edition && libres.some((l) => l.section === section.id))
  const etroit = section.disposition === 'etroit'
  return (
    <section data-section={section.id} className="min-w-0">
      <h3 className="mb-1.5 flex items-baseline gap-2 border-b border-[color:var(--f-accent)] pb-1">
        <span className="text-[16px] font-bold text-[color:var(--f-accent-texte)]">{section.id}</span>
        <span className={`${CAPITALES} text-[12px] font-bold tracking-[0.08em] text-[color:var(--f-encre)]`}>{section.titre}</span>
      </h3>
      {section.texte && <p className="my-1 text-[12.5px]"><Texte t={section.texte} /></p>}
      {lignes.length > 0 && (
        <ul className="space-y-1">
          {lignes.map((l, i) => (
            <li key={`${l.libelle}-${i}`} className={section.disposition === 'empile' ? '' : 'flex gap-2'}>
              {l.libelle && (
                <span className={
                  section.disposition === 'empile' ? 'block font-bold text-[color:var(--f-encre)]'
                    : `shrink-0 font-bold ${etroit ? 'w-[3.2rem] text-[color:var(--f-accent-texte)]' : 'w-[7.5rem] text-[color:var(--f-encre)]'}`
                }>{l.libelle}</span>
              )}
              {l.valeur && <Texte t={l.valeur} className={section.disposition === 'empile' ? 'block text-[12px] text-[color:var(--f-discret)]' : 'min-w-0 [overflow-wrap:anywhere]'} />}
            </li>
          ))}
        </ul>
      )}
      {rien && !edition && <p className="mt-1 text-[12.5px] italic text-[color:var(--f-discret)]">{VIDE_SECTION}</p>}
      {edition && <LignesLibres section={section.id} libres={libres} edition={edition} />}
    </section>
  )
}

/** Lignes libres d'une section, modifiables sur place : « libellé · valeur », ajout et retrait. */
function LignesLibres({ section, libres, edition }: { section: string; libres: LigneLibre[]; edition: EditionFiche }) {
  const miennes = libres.map((l, index) => ({ l, index })).filter((x) => x.l.section === section)
  const maj = (index: number, patch: Partial<LigneLibre>) =>
    edition.onChange({ lignes_libres: libres.map((l, i) => (i === index ? { ...l, ...patch } : l)) })
  return (
    <div className="mt-2 space-y-1.5 border-t border-dashed border-[color:var(--f-filet)] pt-2" data-lignes-libres={section}>
      {miennes.map(({ l, index }) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            aria-label={`Libellé de la ligne libre ${index + 1}`} maxLength={80} value={l.libelle} placeholder="Libellé"
            onChange={(e) => maj(index, { libelle: e.target.value })}
            className="w-[34%] rounded-xs border border-[color:var(--f-filet)] bg-transparent px-1.5 py-1 text-[12px] [@media(pointer:coarse)]:min-h-11"
          />
          <input
            aria-label={`Valeur de la ligne libre ${index + 1}`} maxLength={300} value={l.valeur} placeholder="Valeur"
            onChange={(e) => maj(index, { valeur: e.target.value })}
            className="min-w-0 flex-1 rounded-xs border border-[color:var(--f-filet)] bg-transparent px-1.5 py-1 text-[12px] [@media(pointer:coarse)]:min-h-11"
          />
          <button
            type="button" aria-label={`Retirer la ligne libre ${index + 1}`}
            onClick={() => edition.onChange({ lignes_libres: libres.filter((_, i) => i !== index) })}
            className="rounded-xs p-1 text-[color:var(--f-discret)] hover:text-[color:var(--f-encre)] [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button" disabled={libres.length >= MAX_LIGNES_LIBRES}
        onClick={() => edition.onChange({ lignes_libres: [...libres, { section, libelle: '', valeur: '' }] })}
        className="inline-flex items-center gap-1 rounded-xs text-[12px] font-medium text-[color:var(--f-accent-texte)] hover:underline disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
      >
        <Plus size={13} aria-hidden /> Ajouter une ligne
      </button>
    </div>
  )
}

// ─── Tableau des références ────────────────────────────────────────────────────

function Pastille({ mode }: { mode: NonNullable<FicheReference['intervention']> }) {
  const style = {
    direct: 'bg-[var(--f-clair)] text-[color:var(--f-accent-texte)]',
    sous_traitance: 'bg-[var(--f-ambre-fond)] text-[color:var(--f-ambre-texte)]',
    cotraitance: 'bg-[var(--f-neutre-fond)] text-[color:var(--f-encre)]',
  }[mode]
  return <span className={`${CAPITALES} inline-block whitespace-nowrap rounded-xs px-1.5 py-0.5 text-[12px] font-bold tracking-[0.06em] ${style}`}>{INTERVENTIONS[mode]}</span>
}

function Particulier() {
  return <span className={`${CAPITALES} ml-1.5 rounded-xs bg-[var(--f-neutre-fond)] px-1.5 py-0.5 text-[12px] font-bold tracking-[0.06em] text-[color:var(--f-discret)]`}>Particulier</span>
}

function TableauReferences({ tableau }: { tableau: NonNullable<FicheDonnees['references']> }) {
  const { total } = tableau
  const pluriel = total.chantiers > 1 ? 's' : ''
  const entetes = ['N°', "Client / donneur d'ordre", 'Intervention', 'Chantier et travaux réalisés', 'Montant HT']
  if (tableau.lignes.length === 0) {
    // Aperçu seulement : ce bloc ne figure ni dans le PDF ni dans le Word tant qu'il n'y a pas de référence.
    return (
      <p className="mt-4 border border-dashed border-[color:var(--f-filet)] px-3 py-2.5 text-[12.5px] text-[color:var(--f-discret)]" data-references-vide>
        Le tableau des références apparaîtra ici dès qu'une référence est ajoutée.{' '}
        <Link to="/references" className="font-medium text-[color:var(--f-accent-texte)] underline underline-offset-2">Ajouter une référence</Link>
      </p>
    )
  }
  return (
    <section className="mt-4" data-references aria-label="Références chantiers">
      {tableau.lignes.length > 0 && (
        <div className="hidden sm:block">
          <table className="w-full border-collapse text-left" data-tableau-references>
            <thead>
              <tr className="bg-[var(--f-bandeau)] text-[color:var(--f-bandeau-texte)]">
                {entetes.map((h, i) => (
                  <th key={h} scope="col" className={`${CAPITALES} px-2.5 py-2 text-[12px] font-bold tracking-[0.06em] ${i === 4 ? 'text-right' : ''} ${['w-10', 'w-[24%]', 'w-[8.5rem]', '', 'w-28'][i]}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableau.lignes.map((r) => (
                <tr key={r.numero} className="border-b border-[color:var(--f-filet)] align-top" data-ligne-reference>
                  <td className="px-2.5 py-2 font-bold text-[color:var(--f-accent-texte)]">{String(r.numero).padStart(2, '0')}</td>
                  <td className="px-2.5 py-2">
                    <strong className="text-[color:var(--f-encre)]">{r.client}</strong>{r.particulier && <Particulier />}
                    {r.client_adresse && <span className="block text-[12px] text-[color:var(--f-discret)]">{r.client_adresse}</span>}
                  </td>
                  <td className="px-2.5 py-2">{r.intervention && <Pastille mode={r.intervention} />}</td>
                  <td className="px-2.5 py-2">
                    <strong className="text-[color:var(--f-encre)]">{r.chantier}</strong>
                    {r.lieu && <span className="block text-[12px] text-[color:var(--f-discret)]">{r.lieu}</span>}
                    {r.travaux && <Texte t={r.travaux} className="block text-[12px]" />}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right font-bold text-[color:var(--f-encre)]">{r.montant}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Téléphone : une carte par chantier (le tableau à cinq colonnes ne tient pas dans 390 px). */}
      {tableau.lignes.length > 0 && (
        <ol className="space-y-2 sm:hidden" data-cartes-references>
          {tableau.lignes.map((r) => (
            <li key={r.numero} className="border-b border-[color:var(--f-filet)] pb-2">
              <p className="flex items-baseline justify-between gap-2">
                <span><span className="mr-2 font-bold text-[color:var(--f-accent-texte)]">{String(r.numero).padStart(2, '0')}</span><strong className="text-[color:var(--f-encre)]">{r.client}</strong>{r.particulier && <Particulier />}</span>
                <strong className="whitespace-nowrap text-[color:var(--f-encre)]">{r.montant}</strong>
              </p>
              {r.client_adresse && <p className="text-[12px] text-[color:var(--f-discret)]">{r.client_adresse}</p>}
              <p className="mt-1">{r.intervention && <Pastille mode={r.intervention} />}</p>
              <p className="mt-1"><strong className="text-[color:var(--f-encre)]">{r.chantier}</strong></p>
              {r.lieu && <p className="text-[12px] text-[color:var(--f-discret)]">{r.lieu}</p>}
              {r.travaux && <p className="text-[12px]"><Texte t={r.travaux} /></p>}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-0 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-[color:var(--f-accent)] bg-[var(--f-pale)] px-2.5 py-2" data-total-references>
        <span>
          <strong className={`${CAPITALES} tracking-[0.06em] text-[color:var(--f-accent-texte)]`}>Total</strong>
          <strong className="ml-2 text-[color:var(--f-accent-texte)]">{total.chantiers} chantier{pluriel}</strong>
          {total.sous_traitance > 0 && <span className="ml-2 text-[12px] text-[color:var(--f-discret)]">dont {total.sous_traitance} en sous-traitance</span>}
        </span>
        <strong className="text-[15px] text-[color:var(--f-accent-texte)]">{total.montant}</strong>
      </p>
      <p className="mt-2 text-[12px] italic text-[color:var(--f-discret)]">{tableau.note}</p>
    </section>
  )
}
