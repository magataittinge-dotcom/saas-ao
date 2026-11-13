import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { EtatElement, SectionEtape } from '@/components/etape'
import { LignePiece, ListePieces } from '@/components/project/LignePiece'
import { Bouton } from '@/components/ui/bouton'
import { espacesFr } from '@/lib/espacesFr'
import { gesteEquipe, lectureEquipeDossier, phraseEquipe, sourceEquipe, type ReponseEquipe } from '@/lib/equipeDossier'

/**
 * B3 — « Votre équipe face au dossier » : une ligne par habilitation ou qualification que le dossier cite. À gauche, ce
 * que le profil en dit et les passages du dossier (chacun avec sa source) ; à droite l'état en mots (« Dans votre
 * profil », « À confirmer ») et le geste vers la rubrique de Mon entreprise. Le dossier n'en cite aucune : rien.
 */
export function ListeEquipeDossier({ donnees, onSource }: {
  donnees: ReponseEquipe
  onSource: (idExigence: string, titre?: string) => void
}) {
  if (donnees.lignes.length === 0) return null
  return (
    <SectionEtape
      titre="Votre équipe face au dossier"
      description={`${espacesFr(phraseEquipe(donnees))} Un rapprochement de mots entre le dossier et votre profil\u00a0: à vous de confirmer.`}
    >
      <ListePieces>
        {donnees.lignes.map((l) => {
          const geste = gesteEquipe(l)
          return (
            <LignePiece
              key={l.cle}
              id={`equipe-${l.cle}`}
              nom={l.libelle}
              sous={<>
                {l.profil && <p className="mt-0.5 break-words text-sm text-fg-2">Votre profil&nbsp;: {l.profil}</p>}
                {l.detail && <p className="mt-0.5 break-words text-sm text-fg-2">{espacesFr(l.detail)}</p>}
                {l.sources.map((s) => {
                  const libelle = sourceEquipe(s)
                  return (
                    <div key={s.id} className="mt-1.5">
                      {s.extrait && <p className="break-words text-sm text-fg-2">«&nbsp;{s.extrait}&nbsp;»</p>}
                      <p className="piece-note flex flex-wrap items-center gap-x-3">
                        <span>Source&nbsp;: {libelle ?? 'le dossier'}</span>
                        <Bouton variante="lien" onClick={() => onSource(s.id, s.document ?? undefined)} className="min-h-9">Voir dans le dossier</Bouton>
                      </p>
                    </div>
                  )
                })}
              </>}
              etat={<EtatElement etat={l.statut === 'dans_profil' ? 'pret' : 'a-verifier'} texte={l.statut === 'dans_profil' ? 'Dans votre profil' : 'À confirmer'} />}
              actions={geste ? <Bouton asChild variante="secondaire"><Link to={geste.vers}>{geste.libelle}</Link></Bouton> : null}
            />
          )
        })}
      </ListePieces>
    </SectionEtape>
  )
}

/** La section, lue à l'ouverture de l'étape Pièces. Une panne se dit en une ligne ; elle ne vaut pas « rien à confirmer ». */
export default function EquipeDossier({ projectId, onSource }: {
  projectId: string
  onSource: (idExigence: string, titre?: string) => void
}) {
  const requete = useQuery(lectureEquipeDossier(projectId))
  if (requete.isError) {
    return (
      <p role="status" className="flex flex-wrap items-center gap-x-3 text-sm text-fg-2">
        Le rapprochement entre votre équipe et le dossier n’a pas pu se faire.
        <Bouton variante="lien" onClick={() => { void requete.refetch() }}>Réessayer</Bouton>
      </p>
    )
  }
  return requete.data ? <ListeEquipeDossier donnees={requete.data} onSource={onSource} /> : null
}
