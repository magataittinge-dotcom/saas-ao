import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { api } from '@/services/api'

const FIELD_LABELS: Record<string, string> = {
  activites: 'Activités principales',
  zone_intervention: "Zone d'intervention",
  historique: 'Historique',
  organigramme_description: 'Équipe / effectifs',
  moyens_informatiques: 'Moyens informatiques',
  vehicules: 'Véhicules',
  materiel: 'Matériel',
  demarche_qualite: 'Démarche qualité',
}

/**
 * C7 — décrire ses moyens/équipe/activité en langage libre : Haiku propose
 * des champs structurés en PREVIEW ; rien n'est écrit sans validation
 * explicite (l'utilisateur édite/décoche puis applique).
 */
export default function ProfileFreeTextCard() {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [proposed, setProposed] = useState<Record<string, string> | null>(null)
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const { mutate: structure, isPending: structuring } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ proposed: Record<string, string> }>(
        '/memoire-config/structure-text', { text },
      )
      return data
    },
    onSuccess: ({ proposed: p }) => {
      setError(null)
      if (Object.keys(p).length === 0) {
        setError("Rien d'exploitable détecté dans ce texte — précisez vos moyens, équipe ou activité.")
        setProposed(null)
        return
      }
      setProposed(p)
      setIncluded(new Set(Object.keys(p)))
    },
    onError: () => setError('Structuration indisponible — réessayez dans un instant.'),
  })

  const { mutate: apply, isPending: applying } = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(
        Object.entries(proposed!).filter(([k]) => included.has(k)),
      )
      await api.put('/memoire-config', payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memoire-config'] })
      setProposed(null)
      setText('')
    },
  })

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-ds-cyan" />
        <h3 className="text-sm font-semibold text-ds-text">Décrire en langage libre</h3>
        <span className="text-[11px] text-ds-text-3">l'IA structure, vous validez</span>
      </div>

      {!proposed ? (
        <>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex. : On est une boîte de ravalement à Caen, 8 compagnons, 3 camions benne, 2 échafaudages MDS…"
            className="glass-input w-full py-2.5 text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            {error && <p className="text-xs" style={{ color: '#FBBF24' }}>{error}</p>}
            <button
              onClick={() => structure()}
              disabled={structuring || text.trim().length < 10}
              className="btn-primary ml-auto flex items-center gap-2 py-2 px-4 text-sm disabled:opacity-50"
            >
              {structuring ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Structurer
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-ds-text-2">
            Vérifiez et ajustez avant d'appliquer — seuls les champs cochés seront écrits dans votre profil.
          </p>
          <div className="space-y-2">
            {Object.entries(proposed).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1.5"
                  checked={included.has(key)}
                  onChange={() => setIncluded(prev => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })}
                />
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-ds-text-2 mb-0.5">
                    {FIELD_LABELS[key] ?? key}
                  </label>
                  <textarea
                    rows={2}
                    value={value}
                    onChange={(e) => setProposed(prev => ({ ...prev!, [key]: e.target.value }))}
                    className="glass-input w-full py-1.5 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setProposed(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-ds-text-2 hover:bg-ds-bg-2"
            >
              <X size={14} /> Annuler
            </button>
            <button
              onClick={() => apply()}
              disabled={applying || included.size === 0}
              className="btn-primary flex items-center gap-2 py-2 px-4 text-sm disabled:opacity-50"
            >
              {applying ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Appliquer au profil ({included.size})
            </button>
          </div>
        </>
      )}
    </div>
  )
}
