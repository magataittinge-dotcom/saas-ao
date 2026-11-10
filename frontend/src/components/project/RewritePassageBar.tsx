import { useState } from 'react'
import { api } from '@/services/api'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { Dialogue } from '@/components/ui/dialogue'
import { Message } from '@/components/ui/message'

export interface PassageSelection {
  text: string
  start: number
  end: number
}

interface Props {
  projectId: string
  selection: PassageSelection | null
  onApply: (start: number, end: number, rewritten: string) => void
}

/** Plafond du jour par entreprise : le même que le serveur (routers/memoire.py, REECRIRE_MAX_PAR_JOUR ; un test les compare). */
const PLAFOND_PAR_JOUR = 60

const ACTIONS: { id: string; label: string }[] = [
  { id: 'reformuler', label: 'Reformuler' },
  { id: 'plus_technique', label: 'Plus technique' },
  { id: 'plus_concis', label: 'Plus concis' },
]

/**
 * C9b — réécriture ciblée : agit sur le passage sélectionné SEUL, montre l'avant et l'après, n'applique qu'à l'acceptation
 * explicite. Quatre gestes en mots (Reformuler, Plus technique, Plus concis, Insister sur…), aux boutons du système ; le
 * plafond du jour est annoncé avant le clic ; pendant l'appel, le libellé du geste change (aucune roue).
 */
export default function RewritePassageBar({ projectId, selection, onApply }: Props) {
  const [enCours, setEnCours] = useState<string | null>(null)
  const [insistText, setInsistText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [diff, setDiff] = useState<{
    original: string; rewritten: string; start: number; end: number
  } | null>(null)

  const run = async (action: string) => {
    if (!selection || enCours) return
    setEnCours(action)
    setError(null)
    const { text, start, end } = selection
    try {
      const { data } = await api.post(`/projects/${projectId}/memoire/rewrite-passage`, {
        passage: text,
        action,
        ...(action === 'insister' ? { instruction: insistText } : {}),
      }, { timeout: 120_000 })
      setDiff({ original: data.original, rewritten: data.rewritten, start, end })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'La réécriture n’a pas pu se faire. Votre texte n’a pas changé ; réessayez dans un instant.')
    } finally {
      setEnCours(null)
    }
  }

  const hasSelection = !!selection && selection.text.trim().length > 0
  const bloque = !hasSelection || enCours !== null

  return (
    <>
      <div data-barre-reecriture="" className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <p className="mr-1 text-sm text-fg-2" aria-live="polite">
          {hasSelection ? 'Réécrire la sélection :' : 'Sélectionnez un passage pour le réécrire :'}
        </p>
        {ACTIONS.map((a) => (
          <Bouton key={a.id} variante="secondaire" disabled={bloque} enCours={enCours === a.id} libelleEnCours="Réécriture…" onClick={() => run(a.id)}>
            {a.label}
          </Bouton>
        ))}
        <form
          className="flex min-w-0 items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); if (insistText.trim()) void run('insister') }}
        >
          <Champ
            value={insistText}
            onChange={(e) => setInsistText(e.target.value)}
            placeholder="Insister sur…"
            aria-label="Insister sur : ce que le passage doit mettre en avant"
            disabled={bloque}
            className="w-44 min-w-0"
          />
          <Bouton type="submit" variante="secondaire" disabled={bloque || !insistText.trim()} enCours={enCours === 'insister'} libelleEnCours="Réécriture…">
            Insister
          </Bouton>
        </form>
        {/* Annoncé avant le clic : l'IA réécrit, aucune unité n'est décomptée, le jour a un plafond. */}
        <p className="text-xs text-fg-3 lg:ml-auto">
          Réécriture par l’IA, ne décompte aucune unité · <span className="chiffres">{PLAFOND_PAR_JOUR}</span> par jour au plus
        </p>
      </div>
      {error && <Message ton="erreur" className="mt-2" onFermer={() => setError(null)}>{error}</Message>}

      <Dialogue
        ouvert={diff !== null}
        onOuvert={(o) => { if (!o) setDiff(null) }}
        titre="Réécriture proposée"
        description="Rien n’est changé tant que vous n’acceptez pas."
        taille="grand"
        actions={(
          <>
            <Bouton variante="secondaire" onClick={() => setDiff(null)}>Garder mon texte</Bouton>
            <Bouton variante="principal" onClick={() => { if (diff) onApply(diff.start, diff.end, diff.rewritten); setDiff(null) }}>
              Accepter la réécriture
            </Bouton>
          </>
        )}
      >
        {diff && (
          <div className="grid max-h-[55vh] gap-x-6 gap-y-4 overflow-y-auto sm:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium text-fg-3">Avant</p>
              <p className="whitespace-pre-wrap font-memoire text-base text-fg-2">{diff.original}</p>
            </div>
            <div className="min-w-0 sm:border-l sm:border-bord sm:pl-6">
              <p className="mb-1.5 text-xs font-medium text-fg-2">Après</p>
              <p className="whitespace-pre-wrap font-memoire text-base text-fg">{diff.rewritten}</p>
            </div>
          </div>
        )}
      </Dialogue>
    </>
  )
}
