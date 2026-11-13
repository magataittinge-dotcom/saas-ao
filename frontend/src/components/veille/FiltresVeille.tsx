// Les filtres de la liste des avis : trois puces du système (date limite, procédure, métier), les mots-clés et le tri.
// Une puce proposée s'écrit « + Métier » ; active, elle porte sa valeur et sa croix (« Métier : CVC, Peinture ✕ ») : une
// sélection n'est jamais un aplat. Un appui sur la puce ouvre ses choix juste dessous (boutons radio ou cases du système).
// « Effacer les filtres » n'apparaît que si un filtre est actif. Les changements remontent tout de suite, sauf les
// mots-clés (400 ms).
import { useEffect, useId, useRef, useState } from 'react'
import { CaseACocher, GroupeRadio } from '@/components/ui/case'
import { ChampRecherche } from '@/components/ui/champ'
import { EffacerFiltres, PuceFiltre } from '@/components/ui/filtre'
import { ListeDeroulante } from '@/components/ui/liste-deroulante'
import { DELAIS_JOURS, FILTRES_PAR_DEFAUT, PROCEDURES_LIBELLES, basculerValeur, type FiltresAvis, type TriAvis } from '@/lib/veille'

export interface PropsFiltresVeille {
  filtres: FiltresAvis
  onFiltres: (p: Partial<FiltresAvis>) => void
  tri: TriAvis
  onTri: (t: TriAvis) => void
  metiers: readonly { code: string; libelle: string }[]
}

const TRIS = [
  { valeur: 'date_limite', libelle: 'Trier par date limite' },
  { valeur: 'date_parution', libelle: 'Trier par parution récente' },
] as const

/** Champ de mots-clés : la saisie est locale, le filtre ne change qu'après 400 ms sans frappe. */
function ChampMotsCles({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(valeur)
  useEffect(() => { setLocal(valeur) }, [valeur])
  useEffect(() => {
    if (local === valeur) return
    const t = setTimeout(() => onChange(local.slice(0, 120)), 400)
    return () => clearTimeout(t)
  }, [local, valeur, onChange])
  return (
    <label className="min-w-48 flex-1">
      <span className="sr-only">Mots-clés</span>
      <ChampRecherche value={local} maxLength={120} placeholder="Mots-clés : école, façade, chaufferie…" onChange={(e) => setLocal(e.target.value)} />
    </label>
  )
}

/** « CVC, Peinture » ; au-delà de deux : « CVC, Peinture et 3 autres ». */
export function resumeChoix(libelles: readonly string[]): string | null {
  if (libelles.length === 0) return null
  if (libelles.length <= 2) return libelles.join(', ')
  const reste = libelles.length - 2
  return `${libelles.slice(0, 2).join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`
}

/** Le nombre de filtres actifs (les mots-clés comptent ; la zone n'est pas un filtre). */
export const nombreFiltres = (f: FiltresAvis): number =>
  (f.delai_jours !== null ? 1 : 0) + (f.procedures.length > 0 ? 1 : 0) + (f.metiers.length > 0 ? 1 : 0) + (f.mots_cles.trim() !== '' ? 1 : 0)

type Panneau = 'delai' | 'procedure' | 'metier'
const delaiVersTexte = (j: number | null) => (j === null ? 'toutes' : String(j))

export default function FiltresVeille({ filtres, onFiltres, tri, onTri, metiers }: PropsFiltresVeille) {
  const [ouvert, setOuvert] = useState<Panneau | null>(null)
  const idPanneau = useId()
  const basculer = (p: Panneau) => setOuvert((o) => (o === p ? null : p))
  // les choix s'ouvrent par-dessus la liste (ils ne la poussent plus) : Échap ou un appui ailleurs les referme
  const zone = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return undefined
    const dehors = (e: PointerEvent) => { if (zone.current && !zone.current.contains(e.target as Node)) setOuvert(null) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(null) }
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])
  const procedures = PROCEDURES_LIBELLES.filter((p) => filtres.procedures.includes(p.code)).map((p) => p.libelle)
  const metiersChoisis = metiers.filter((m) => filtres.metiers.includes(m.code)).map((m) => m.libelle)
  return (
    <div className="grid gap-3" role="group" aria-label="Filtres des avis">
      <div ref={zone} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <PuceFiltre libelle="Date limite" valeur={filtres.delai_jours === null ? null : `sous ${filtres.delai_jours} jours`}
          onOuvrir={() => basculer('delai')} onRetirer={() => onFiltres({ delai_jours: null })} />
        <PuceFiltre libelle="Procédure" valeur={resumeChoix(procedures)}
          onOuvrir={() => basculer('procedure')} onRetirer={() => onFiltres({ procedures: [] })} />
        <PuceFiltre libelle="Métier" valeur={resumeChoix(metiersChoisis)}
          onOuvrir={() => basculer('metier')} onRetirer={() => onFiltres({ metiers: [] })} />
        <EffacerFiltres actifs={nombreFiltres(filtres)} onEffacer={() => { onFiltres(FILTRES_PAR_DEFAUT); setOuvert(null) }} />
      </div>

      {ouvert === 'delai' && (
        <div id={idPanneau} data-choix-filtre="delai" className="absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-bord bg-surface-pop px-4 py-2 shadow-flottant">
          <GroupeRadio libelle="Date limite" valeur={delaiVersTexte(filtres.delai_jours)}
            onChange={(v) => { const j = DELAIS_JOURS.find((d) => delaiVersTexte(d) === v) ?? null; onFiltres({ delai_jours: j }) }}
            options={DELAIS_JOURS.map((j) => ({ valeur: delaiVersTexte(j), libelle: j === null ? 'Toutes les dates' : `Sous ${j} jours` }))}
            className="sm:grid-cols-2" />
        </div>
      )}
      {ouvert === 'procedure' && (
        <div id={idPanneau} data-choix-filtre="procedure" role="group" aria-label="Procédures" className="grid gap-x-6 sm:grid-cols-2 absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-bord bg-surface-pop px-4 py-2 shadow-flottant">
          {PROCEDURES_LIBELLES.map((p) => (
            <CaseACocher key={p.code} libelle={p.libelle} coche={filtres.procedures.includes(p.code)}
              onChange={() => onFiltres({ procedures: basculerValeur(filtres.procedures, p.code) })} />
          ))}
        </div>
      )}
      {ouvert === 'metier' && (
        <div id={idPanneau} data-choix-filtre="metier" role="group" aria-label="Métiers" className="grid gap-x-6 sm:grid-cols-2 absolute inset-x-0 top-full z-20 mt-2 rounded-lg border border-bord bg-surface-pop px-4 py-2 shadow-flottant">
          {/* par ordre alphabétique, « Autre » en dernier (jury, tour 3 : on cherchait son métier) ; aucune hauteur bornée ici : la page défile, pas la liste */}
          {[...metiers].sort((a, b) => (a.libelle === 'Autre' ? 1 : b.libelle === 'Autre' ? -1 : a.libelle.localeCompare(b.libelle, 'fr'))).map((m) => (
            <CaseACocher key={m.code} libelle={m.libelle} coche={filtres.metiers.includes(m.code)}
              onChange={() => onFiltres({ metiers: basculerValeur(filtres.metiers, m.code) })} />
          ))}
        </div>
      )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ChampMotsCles valeur={filtres.mots_cles} onChange={(v) => onFiltres({ mots_cles: v })} />
        <ListeDeroulante libelle="Trier par" valeur={tri} onChange={(v) => onTri(v as TriAvis)} options={TRIS} className="w-auto min-w-56 max-sm:w-full" />
      </div>
    </div>
  )
}
