import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import { messageErreur } from '@/lib/erreurs'
import { Bouton } from '@/components/ui/bouton'
import { CaseACocher } from '@/components/ui/case'
import { ZoneTexte } from '@/components/ui/champ'
import { Message } from '@/components/ui/message'

const FIELD_LABELS: Record<string, string> = {
  activites: 'Activités principales',
  zone_intervention: "Zone d’intervention",
  historique: 'Historique',
  organigramme_description: 'Équipe / effectifs',
  moyens_informatiques: 'Moyens informatiques',
  vehicules: 'Véhicules',
  materiel: 'Matériel',
  demarche_qualite: 'Démarche qualité',
}

/**
 * C7 — décrire ses moyens, son équipe et son activité avec ses mots : Synorix range le texte en rubriques et le PROPOSE ;
 * rien n'est écrit sans validation (l'utilisateur corrige, décoche, puis applique). A13 : le bouton dit ce qu'il fait
 * (« Ranger en rubriques »), pas un mot du logiciel.
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
        setError('Synorix n’a rien trouvé à ranger dans ce texte : précisez vos moyens, votre équipe ou votre activité.')
        setProposed(null)
        return
      }
      setProposed(p)
      setIncluded(new Set(Object.keys(p)))
    },
    // 429 (plafond ou budget du jour) : la phrase du serveur ; une panne : la nôtre.
    onError: async (err) => setError(await messageErreur(err, 'Le rangement en rubriques n’a pas abouti. Votre texte est gardé : réessayez dans un instant.')),
  })

  const { mutate: apply, isPending: applying, isError: echecApplication } = useMutation({
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

  const basculer = (key: string) => setIncluded((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  if (!proposed) {
    return (
      <div className="grid gap-3">
        <p className="max-w-prose text-pretty text-sm text-fg-2">Écrivez quelques phrases sur votre entreprise : vos équipes, votre matériel, vos chantiers. Synorix les range en rubriques ; vous vérifiez avant que rien ne soit écrit.</p>
        <ZoneTexte className="resize-none" rows={3} aria-label="Décrire avec vos mots" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ex. : On est une entreprise de ravalement à Caen, 8 compagnons, 3 camions benne, 2 échafaudages…" />
        {error && <Message ton="attention">{error}</Message>}
        <div>
          <Bouton variante="secondaire" onClick={() => structure()} disabled={text.trim().length < 10} enCours={structuring} libelleEnCours="Rangement en cours…">
            Ranger en rubriques
          </Bouton>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-fg-2">Vérifiez et corrigez : seules les rubriques cochées seront écrites dans votre profil.</p>
      {Object.entries(proposed).map(([key, value]) => (
        <div key={key} className="grid gap-1">
          <CaseACocher libelle={FIELD_LABELS[key] ?? key} coche={included.has(key)} onChange={() => basculer(key)} />
          <ZoneTexte className="resize-none" rows={2} aria-label={FIELD_LABELS[key] ?? key} value={value} disabled={!included.has(key)}
            onChange={(e) => setProposed((prev) => ({ ...prev!, [key]: e.target.value }))} />
        </div>
      ))}
      {echecApplication && <Message ton="erreur">L’écriture dans votre profil n’a pas abouti. Vos corrections sont gardées : réessayez.</Message>}
      <div className="flex flex-wrap justify-end gap-2">
        <Bouton variante="secondaire" onClick={() => setProposed(null)} disabled={applying}>Annuler</Bouton>
        <Bouton variante="secondaire" onClick={() => apply()} disabled={included.size === 0} enCours={applying} libelleEnCours="Écriture…">
          {`Écrire dans mon profil (${included.size})`}
        </Bouton>
      </div>
    </div>
  )
}
