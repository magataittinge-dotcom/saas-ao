import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Sparkles, X } from 'lucide-react'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'

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
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-accent-text" aria-hidden />
        <h3 className="text-sm font-semibold text-fg">Décrire en langage libre</h3>
        <span className="text-xs text-fg-3">l'IA structure, vous validez</span>
      </div>

      {!proposed ? (
        <>
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Décrire votre entreprise en langage libre"
            placeholder="Ex. : On est une boîte de ravalement à Caen, 8 compagnons, 3 camions benne, 2 échafaudages MDS…"
            className="resize-y py-2.5 text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            {error && <p role="alert" className="text-xs text-warning">{error}</p>}
            <Button
              onClick={() => structure()}
              disabled={structuring || text.trim().length < 10}
              size="sm"
              className="ml-auto"
            >
              {structuring ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
              Structurer
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-fg-2">
            Vérifiez et ajustez avant d'appliquer — seuls les champs cochés seront écrits dans votre profil.
          </p>
          <div className="space-y-2">
            {Object.entries(proposed).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-1.5 size-4 accent-accent-ui"
                  aria-label={`Inclure « ${FIELD_LABELS[key] ?? key} »`}
                  checked={included.has(key)}
                  onChange={() => setIncluded(prev => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    return next
                  })}
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`structure-${key}`} className="mb-0.5 block text-xs font-medium text-fg-2">
                    {FIELD_LABELS[key] ?? key}
                  </label>
                  <Textarea
                    id={`structure-${key}`}
                    rows={2}
                    value={value}
                    onChange={(e) => setProposed(prev => ({ ...prev!, [key]: e.target.value }))}
                    className="min-h-0 py-1.5 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setProposed(null)}>
              <X size={14} aria-hidden /> Annuler
            </Button>
            <Button size="sm" onClick={() => apply()} disabled={applying || included.size === 0}>
              {applying ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
              Appliquer au profil ({included.size})
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
