import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, ChevronDown, Send, Trash2, Trophy, X } from 'lucide-react'
import { api } from '@/services/api'
import { echeanceAO, momentLimite } from '@/lib/echeance'
import { jourCourt, repartitionTermines } from '@/lib/mesAO'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'
import { Pastille, type TonEtat } from './Etat'
import type { LucideIcon } from 'lucide-react'

const STATUT: Record<string, { libelle: string; ton: TonEtat; icone: LucideIcon }> = {
  soumis: { libelle: 'Déposé', ton: 'bleu', icone: Send },
  gagné: { libelle: 'Gagné', ton: 'vert', icone: Trophy },
  perdu: { libelle: 'Perdu', ton: 'rouge', icone: X },
  sans_suite: { libelle: 'Sans suite', ton: 'gris', icone: Ban },
}

const jour = jourCourt

/** « déposé le 28 oct. » (date enregistrée au dépôt), sinon « remise le … », sinon « mis à jour le … ». */
export function dateTerminee(p: Project): string {
  if (p.status === 'soumis' && p.depose_at) return `déposé le ${jour(new Date(p.depose_at))}`
  const limite = momentLimite(echeanceAO(p))
  if (limite) return `remise le ${jour(limite)}`
  return `mis à jour le ${jour(new Date(p.updated_at))}`
}

function LigneTerminee({ projet, onSupprimer }: { projet: Project; onSupprimer?: (id: string, nom: string) => void }) {
  const queryClient = useQueryClient()
  const { mutate: definir, isPending } = useMutation({
    mutationFn: async (status: string) => { await api.patch(`/projects/${projet.id}`, { status }) },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
  const s = STATUT[projet.status] ?? STATUT.sans_suite
  return (
    <li data-terminee={projet.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-bord-2 px-4 py-3.5 first:border-t-0 sm:px-5">
      <div className="flex min-w-0 basis-[18rem] flex-1 flex-col gap-0.5">
        <Link to={`/projects/${projet.id}`} className="break-words text-[14.5px] font-semibold text-fg hover:text-accent-text">{projet.name}</Link>
        {projet.maitre_ouvrage && <span className="break-words text-[13px] text-fg-2">{projet.maitre_ouvrage}</span>}
      </div>
      <span className="sm:w-[8.5rem]"><Pastille ton={s.ton} icone={s.icone}>{s.libelle}</Pastille></span>
      <span className="text-[13px] text-fg-2 sm:w-36">{dateTerminee(projet)}</span>
      {projet.status === 'soumis' ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-fg-2">Résultat :</span>
          <button type="button" disabled={isPending} onClick={() => definir('gagné')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-vert-mark px-3 text-[13px] font-semibold text-vert-ink hover:bg-vert-soft disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
            <Check size={14} aria-hidden />Gagné
          </button>
          <button type="button" disabled={isPending} onClick={() => definir('perdu')} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-bord-2 px-3 text-[13px] font-semibold text-fg hover:bg-surface-1 disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
            <X size={14} aria-hidden />Perdu
          </button>
        </span>
      ) : (
        <Link to={`/projects/${projet.id}`} className="inline-flex min-h-9 items-center text-[13.5px] font-semibold text-accent-text hover:underline [@media(pointer:coarse)]:min-h-11">Ouvrir</Link>
      )}
      {onSupprimer && (
        <button type="button" onClick={() => onSupprimer(projet.id, projet.name)} aria-label={`Supprimer l’AO « ${projet.name} »`} title="Supprimer cet AO"
          className="inline-flex size-9 items-center justify-center rounded-xl text-fg-3 hover:bg-surface-2 hover:text-rouge-ink [@media(pointer:coarse)]:size-11">
          <Trash2 size={15} aria-hidden />
        </button>
      )}
    </li>
  )
}

/** Les AO terminés, repliés par défaut : le décompte par statut reste visible, les lignes s'ouvrent d'un clic. */
export function Termines({ projets, onSupprimer, ouvertParDefaut = false }: { projets: Project[]; onSupprimer?: (id: string, nom: string) => void; ouvertParDefaut?: boolean }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  if (projets.length === 0) return null
  const parStatut = repartitionTermines(projets)
  return (
    <section aria-label="Appels d’offres terminés" className="space-y-3">
      <button
        type="button" aria-expanded={ouvert} aria-controls="liste-terminees" onClick={() => setOuvert((v) => !v)}
        className="flex min-h-11 w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-carte border border-bord-2 bg-surface-0 px-4 py-3.5 text-left hover:border-bord-2 hover:bg-surface-1 sm:px-5"
      >
        <span className="font-display text-h6 text-fg">Terminés</span>
        <Pastille ton="gris">{projets.length}</Pastille>
        <span className="order-last flex basis-full flex-wrap gap-2 sm:order-none sm:basis-0 sm:flex-1">
          {parStatut.map(([statut, n]) => <Pastille key={statut} ton={STATUT[statut].ton} icone={STATUT[statut].icone}>{STATUT[statut].libelle} {n}</Pastille>)}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-accent-text">
          {ouvert ? 'Replier' : 'Afficher'}
          <ChevronDown size={16} aria-hidden className={cn('transition-transform duration-base ease-lien motion-reduce:transition-none', ouvert && 'rotate-180')} />
        </span>
      </button>
      {ouvert && (
        <ul id="liste-terminees" className="overflow-hidden rounded-carte border border-bord-2 bg-surface-0">
          {projets.map((p) => <LigneTerminee key={p.id} projet={p} onSupprimer={onSupprimer} />)}
        </ul>
      )}
    </section>
  )
}
