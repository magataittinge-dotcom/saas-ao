// Choisir une zone par la recherche : un département (par son nom ou son numéro), une ville ou un code postal,
// avec un rayon autour de la ville (0, 25, 50, 100 km). Les départements se résolvent sur place ; les villes passent
// par l'API Adresse (débounce 300 ms, la requête précédente est abandonnée). Sur téléphone, c'est le moyen principal
// de choisir une zone.
//
//   <RechercheZone selection={codes} ville={ville} onZone={({ selection, ville }) => …} />
import { Fragment, useEffect, useId, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import './recherche-zone.css'
import { DEPARTEMENTS } from './donnees/departements'
import { chercherCommunes, type ChercherCommunes } from '@/services/adresse'
import {
  RAYONS_KM, chercherDepartements, departementsDeLaVille, estSaisieDeCode, nettoyerRequete, rechercheDifferee,
  villeDepuisAdresse, type FeatureAdresse, type VilleZone,
} from '@/lib/veille'
import { MAX_DEPARTEMENTS } from '@/lib/carteFrance'

export interface ZoneChoisie { selection: string[]; ville: VilleZone | null }

export interface PropsRechercheZone {
  selection: readonly string[]
  ville: VilleZone | null
  onZone: (zone: ZoneChoisie) => void
  /** Recherche de communes (injectable pour les tests et les captures). */
  chercher?: ChercherCommunes
  className?: string
}

type Statut = 'repos' | 'recherche' | 'ok' | 'indisponible'
interface Option {
  id: string
  type: 'departement' | 'commune'
  libelle: string
  detail: string
  choisir: () => void
}

const nomDe = (code: string) => DEPARTEMENTS.find((d) => d.code === code)?.nom ?? code

export default function RechercheZone({ selection, ville, onZone, chercher = chercherCommunes, className }: PropsRechercheZone) {
  const idBase = useId()
  const [saisie, setSaisie] = useState('')
  const [communes, setCommunes] = useState<FeatureAdresse[]>([])
  const [statut, setStatut] = useState<Statut>('repos')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(-1)
  const recherche = useMemo(() => rechercheDifferee(chercher), [chercher])
  useEffect(() => () => recherche.annuler(), [recherche])

  const surSaisie = (valeur: string) => {
    setSaisie(valeur)
    setActif(-1)
    setOuvert(valeur.trim().length > 0)
    const q = nettoyerRequete(valeur)
    if (q.length < 2 || estSaisieDeCode(q)) {
      recherche.annuler()
      setCommunes([])
      setStatut('repos')
      return
    }
    setStatut('recherche')
    recherche.demander(q, (r) => { setCommunes(r); setStatut('ok') }, () => { setCommunes([]); setStatut('indisponible') })
  }

  const fermer = () => { setOuvert(false); setSaisie(''); setCommunes([]); setStatut('repos'); setActif(-1); recherche.annuler() }

  const ajouterDepartement = (code: string) => {
    const suite = selection.includes(code) || selection.length >= MAX_DEPARTEMENTS ? [...selection] : [...selection, code]
    onZone({ selection: suite, ville: null })
    fermer()
  }
  const choisirCommune = (f: FeatureAdresse) => {
    const v = villeDepuisAdresse(f, ville?.rayon_km ?? 0)
    if (!v) return
    onZone({ selection: departementsDeLaVille(v).slice(0, MAX_DEPARTEMENTS), ville: v })
    fermer()
  }
  const changerRayon = (km: number) => {
    if (!ville) return
    const v = { ...ville, rayon_km: km }
    onZone({ selection: departementsDeLaVille(v).slice(0, MAX_DEPARTEMENTS), ville: v })
  }
  const retirer = (code: string) => onZone({ selection: selection.filter((c) => c !== code), ville: null })

  const options: Option[] = useMemo(() => {
    const deps: Option[] = chercherDepartements(saisie).map((d) => ({
      id: `dep-${d.code}`, type: 'departement', libelle: d.nom, detail: `Département ${d.code}`, choisir: () => ajouterDepartement(d.code),
    }))
    const villes: Option[] = communes.flatMap((f, i) => {
      const v = villeDepuisAdresse(f)
      return v ? [{
        id: `commune-${i}`, type: 'commune' as const, libelle: v.libelle,
        detail: [v.code_postal, nomDe(v.departement)].filter(Boolean).join(' · '), choisir: () => choisirCommune(f),
      }] : []
    })
    return [...deps, ...villes]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie, communes, selection, ville])

  const surTouche = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((a) => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      const o = options[actif] ?? (options.length === 1 ? options[0] : undefined)
      if (o) { e.preventDefault(); o.choisir() }
    } else if (e.key === 'Escape') { fermer() }
  }

  const idListe = `${idBase}-liste`
  const aucun = ouvert && statut !== 'recherche' && options.length === 0 && nettoyerRequete(saisie).length >= 2
  const nbDeps = options.filter((o) => o.type === 'departement').length

  return (
    <div className={['rz', className].filter(Boolean).join(' ')}>
      <div className="rz-recherche">
      <label htmlFor={`${idBase}-champ`} className="rz-etiquette">Département, ville ou code postal</label>
      <div className="rz-champ">
        <Search size={16} aria-hidden className="rz-loupe" />
        <input
          id={`${idBase}-champ`}
          type="text"
          role="combobox"
          aria-expanded={ouvert && options.length > 0}
          aria-controls={idListe}
          aria-autocomplete="list"
          aria-activedescendant={actif >= 0 && options[actif] ? `${idBase}-${options[actif].id}` : undefined}
          autoComplete="off"
          inputMode="search"
          enterKeyHint="search"
          value={saisie}
          placeholder="Rhône, Lyon, 69003…"
          onChange={(e) => surSaisie(e.target.value)}
          onKeyDown={surTouche}
          className="rz-saisie"
        />
        {saisie && (
          <button type="button" className="rz-vider" aria-label="Effacer la saisie" onClick={fermer}>
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      {ouvert && (
        <div className="rz-menu">
          <ul id={idListe} role="listbox" aria-label="Zones proposées" className="rz-liste">
            {options.map((o, i) => (
              <Fragment key={o.id}>
                {((i === 0 && o.type === 'departement') || (i === nbDeps && o.type === 'commune')) && (
                  <li role="presentation" className="rz-groupe">{o.type === 'departement' ? 'Départements' : 'Communes'}</li>
                )}
                <li
                  id={`${idBase}-${o.id}`}
                  role="option"
                  aria-selected={i === actif}
                  data-type={o.type}
                  className="rz-option"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={o.choisir}
                >
                  <span className="rz-libelle">{o.libelle}</span>
                  <span className="rz-detail">{o.detail}</span>
                </li>
              </Fragment>
            ))}
          </ul>
          {statut === 'recherche' && <p className="rz-etat" role="status">Recherche des communes…</p>}
          {statut === 'indisponible' && <p className="rz-etat" role="status">La recherche de communes n'est pas joignable pour le moment. Les départements restent disponibles.</p>}
          {aucun && statut === 'ok' && <p className="rz-etat" role="status">Aucune commune ni aucun département ne correspond.</p>}
        </div>
      )}
      </div>

      {ville && (
        <fieldset className="rz-rayon">
          <legend className="rz-etiquette">Rayon autour de {ville.libelle}</legend>
          <div className="rz-rayons" role="radiogroup" aria-label={`Rayon autour de ${ville.libelle}`}>
            {RAYONS_KM.map((km) => (
              <button
                key={km}
                type="button"
                role="radio"
                aria-checked={(ville.rayon_km ?? 0) === km}
                className="rz-rayon-bouton"
                onClick={() => changerRayon(km)}
              >
                {km === 0 ? 'Département' : `${km} km`}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {selection.length > 0 && (
        <div className="rz-zone">
          <ul className="rz-puces" aria-label="Zone choisie">
            {selection.map((c) => (
              <li key={c} className="rz-puce">
                <span>{nomDe(c)}</span>
                <button type="button" className="rz-puce-x" aria-label={`Retirer ${nomDe(c)} de la zone`} onClick={() => retirer(c)}>
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="rz-effacer" onClick={() => onZone({ selection: [], ville: null })}>Effacer la zone</button>
        </div>
      )}
    </div>
  )
}
