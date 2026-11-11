import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bouton } from '@/components/ui/bouton'
import { Champ } from '@/components/ui/champ'
import { authService } from '@/services/auth'
import { useAuthStore } from '@/stores/authStore'
import { Field } from './champs'
import type { Organization } from '@/types'

const chiffres = (v: string) => v.replace(/\D/g, '')

/**
 * G7 — le SIRET se saisit dans « Mon entreprise », profil déjà rempli ou non. Le contrôle est celui de l'inscription
 * (`/auth/sync`, répertoire Sirene) ; `depuis_profil` adapte les phrases. Un numéro valide remplit la raison sociale (règle
 * `raison_sociale.py`) et l'adresse si elle est vide ; un numéro invalide est dit sobrement et rien ne change.
 */
/** Ce que le formulaire appelle à son « Enregistrer » : un SIRET saisi mais pas encore envoyé part avec le reste. */
export interface ChampSiretHandle { enregistrerSaisie: () => Promise<Organization | null> }

/**
 * Le SIRET à envoyer à l'enregistrement du formulaire : celui qui est à l'écran s'il diffère de celui du serveur ; rien
 * s'il est vide ou déjà enregistré. Avant ce correctif, seul « Vérifier » l'envoyait : tapé puis « Enregistrer », il
 * disparaissait au rechargement (le formulaire écrit par PATCH /organizations/me, qui ne porte pas le SIRET).
 */
export function siretASoumettre(valeur: string, enregistre: string | null | undefined): string | null {
  const saisi = chiffres(valeur)
  return saisi && saisi !== chiffres(enregistre ?? '') ? valeur.trim() : null
}

const ChampSiret = forwardRef<ChampSiretHandle, { siret?: string | null; verifie?: boolean }>(function ChampSiret({ siret, verifie }, ref) {
  const setOrganization = useAuthStore((s) => s.setOrganization)
  const client = useQueryClient()
  const [valeur, setValeur] = useState(siret ?? '')
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirme, setConfirme] = useState(false)

  useEffect(() => { setValeur(siret ?? '') }, [siret])

  const modifie = chiffres(valeur) !== chiffres(siret ?? '') || (!verifie && chiffres(valeur) !== '')
  const verifier = async (): Promise<Organization | null> => {
    if (!chiffres(valeur) || occupe) return null
    setOccupe(true)
    setMessage(null)
    setConfirme(false)
    try {
      const res = await authService.sync({ siret: valeur.trim(), depuis_profil: true })
      setOrganization(res.organization)
      const avertissement = (res as { siret_warning?: string }).siret_warning
      if (avertissement) setMessage(avertissement)
      else setConfirme(true)
      client.invalidateQueries({ queryKey: ['memoire-config'] })
      return res.organization
    } catch {
      setMessage('La vérification n’a pas abouti. Réessayez dans un instant.')
      return null
    } finally {
      setOccupe(false)
    }
  }
  useImperativeHandle(ref, () => ({
    enregistrerSaisie: () => (siretASoumettre(valeur, siret) ? verifier() : Promise.resolve(null)),
  }))

  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="SIRET" rempli={chiffres(siret ?? '') !== ''} source={verifie && !modifie ? 'Vérifié au répertoire Sirene' : undefined}>
            <Champ
              className="chiffres"
              value={valeur}
              onChange={(e) => { setValeur(e.target.value); setMessage(null); setConfirme(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void verifier() } }}
              inputMode="numeric" autoComplete="off" placeholder="14 chiffres"
            />
          </Field>
        </div>
        {modifie && (
          <Bouton variante="secondaire" onClick={() => void verifier()} disabled={!chiffres(valeur)} enCours={occupe} libelleEnCours="Vérification…">
            Vérifier
          </Bouton>
        )}
      </div>
      <p role="status" className="text-xs text-ambre-ink empty:hidden">{message}</p>
      {confirme && <p role="status" className="text-xs text-fg-2">SIRET vérifié au répertoire Sirene.</p>}
    </div>
  )
})
export default ChampSiret
