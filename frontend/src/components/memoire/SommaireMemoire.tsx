import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { EntreeSommaire } from '@/lib/memoireSections'
import {
  bilanCriteres, libelleSousCritere, parSection, type RattachementCriteres,
} from '@/lib/memoireCriteres'
import type { SourceChamp } from '@/hooks/useSourceChamp'
import { bilanARefaire, etatDe, type EtatsSections } from '@/lib/memoireEtats'

const F = 'var(--font-ui)'

interface Props {
  entrees: EntreeSommaire[]
  activeSection: string
  onNavigate: (id: string) => void
  /** E1 — sous-critères du RC rattachés à chaque partie, et ceux à couvrir (null = pas encore lu). */
  criteres?: RattachementCriteres | null
  /** Source des critères dans le règlement : « Voir dans le dossier » des sous-critères à couvrir. */
  sourceCriteres?: SourceChamp | null
  onOpenSource?: (source: SourceChamp) => void
  /** Téléphone : le sommaire se replie (fermé par défaut) au lieu d'être une carte collée à gauche. */
  repliable?: boolean
  /** E3 — parties que le patron a marquées « À refaire ». */
  etats?: EtatsSections
}

/** Le sommaire du mémoire : parties et sections, avec pour chaque section les sous-critères du RC qu'elle traite. */
export default function SommaireMemoire({
  entrees, activeSection, onNavigate, criteres, sourceCriteres, onOpenSource, repliable = false, etats,
}: Props) {
  const [fermees, setFermees] = useState<Set<string>>(new Set())
  const [ouvert, setOuvert] = useState(false)

  const basculer = (id: string) => {
    setFermees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const rattaches = parSection(criteres)
  const aCouvrir = criteres?.a_couvrir ?? []
  const bilan = bilanCriteres(criteres)
  const bilanRefaire = bilanARefaire(etats)
  // « sec-dechets » → clés « partie_b.dechets » : l'identifiant d'une section ne porte que la sous-section
  const cleDe = (parent: EntreeSommaire, enfant: EntreeSommaire) => {
    const part = parent.id.replace('partie-', 'partie_')
    return `${part}.${enfant.id.replace('sec-', '')}`
  }

  const corps = (
    <>
      {bilanRefaire && (
        <p className="memoire-bilan-refaire mb-2 text-xs" style={{ color: 'var(--text-2)', fontFamily: F }}>{bilanRefaire}</p>
      )}
      {bilan && (
        <section className="mb-3 pb-3" style={{ borderBottom: '1px solid var(--border-1)' }} aria-label="Critères du règlement à couvrir">
          <p className="microlabel mb-1.5">Critères du règlement</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-2)', fontFamily: F }}>{bilan}</p>
          {aCouvrir.length > 0 && (
            <ul className="mt-2 space-y-2">
              {aCouvrir.map((c) => (
                <li key={c.nom} className="text-xs leading-snug" style={{ fontFamily: F }}>
                  <span className="memoire-a-couvrir" style={{ color: 'var(--text-1)', fontWeight: 600 }}>À couvrir</span>
                  <span style={{ color: 'var(--text-2)' }}> · {libelleSousCritere(c.nom, c.poids)}</span>
                  {sourceCriteres && onOpenSource && (
                    <button
                      type="button"
                      onClick={() => onOpenSource(sourceCriteres)}
                      aria-label={`Voir dans le dossier : ${c.nom}`}
                      className="block mt-0.5 underline underline-offset-2"
                      style={{ color: 'var(--text-1)' }}
                    >
                      Voir dans le dossier
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <nav aria-label="Sommaire du mémoire" className="space-y-1">
        {entrees.map((section) => {
          const ouverte = !fermees.has(section.id)
          const active = activeSection === section.id
          return (
            <div key={section.id}>
              <button
                onClick={() => {
                  if (section.enfants.length > 0) basculer(section.id)
                  onNavigate(section.id)
                  if (repliable && section.enfants.length === 0) setOuvert(false)
                }}
                aria-expanded={section.enfants.length > 0 ? ouverte : undefined}
                className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded text-left transition-colors hover:bg-ds-bg-2"
                style={{ borderLeft: active ? '2px solid var(--text-1)' : '2px solid transparent' }}
              >
                {section.enfants.length > 0 ? (
                  ouverte
                    ? <ChevronDown size={12} style={{ color: 'var(--text-3)' }} />
                    : <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />
                ) : <span style={{ width: 12 }} />}
                <span className="text-sm font-semibold" style={{ color: 'var(--text-1)', fontFamily: F }}>
                  {section.titre}
                </span>
              </button>
              {section.enfants.length > 0 && ouverte && (
                <div className="ml-2 space-y-0.5">
                  {section.enfants.map((enfant) => {
                    const enfantActif = activeSection === enfant.id
                    const traites = rattaches[cleDe(section, enfant)] ?? []
                    return (
                      <button
                        key={enfant.id}
                        onClick={() => { onNavigate(enfant.id); if (repliable) setOuvert(false) }}
                        className="w-full text-left py-1 px-4 text-xs transition-colors hover:text-fg"
                        style={{
                          color: enfantActif ? 'var(--text-1)' : 'var(--text-3)',
                          fontWeight: enfantActif ? 600 : 400,
                          borderLeft: enfantActif ? '2px solid var(--text-1)' : '2px solid transparent',
                          fontFamily: F,
                        }}
                      >
                        {enfant.titre}
                        {etatDe(etats, section.id.replace('partie-', 'partie_'), enfant.id.replace('sec-', '')) === 'a_refaire' && (
                          <span className="memoire-a-refaire block text-xs leading-snug" style={{ color: 'var(--warn)', fontWeight: 600 }}>À refaire</span>
                        )}
                        {traites.map((s) => (
                          <span
                            key={s.nom}
                            className="memoire-critere-pastille mt-1 block w-fit max-w-full rounded px-1.5 py-0.5 text-xs leading-snug"
                            style={{ color: 'var(--text-2)', fontWeight: 400, background: 'color-mix(in srgb, var(--text-1) 6%, transparent)' }}
                          >
                            {libelleSousCritere(s.nom, s.poids)}
                          </span>
                        ))}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

    </>
  )

  if (repliable) {
    return (
      <div className="glass-card rounded-lg" style={{ border: '1px solid var(--border-1)' }}>
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="microlabel">Sommaire</span>
          <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)', fontFamily: F }}>
            {aCouvrir.length > 0 && <span>{aCouvrir.length} à couvrir</span>}
            {ouvert ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {ouvert && <div className="px-4 pb-4">{corps}</div>}
      </div>
    )
  }

  return (
    <div
      className="glass-card rounded-lg p-4 sticky top-4"
      style={{ border: '1px solid var(--border-1)', boxShadow: 'var(--shadow-card)', width: 220, maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}
    >
      <p className="microlabel mb-3">Sommaire</p>
      {corps}
    </div>
  )
}
