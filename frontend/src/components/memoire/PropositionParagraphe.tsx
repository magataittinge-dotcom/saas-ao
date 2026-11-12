import { ArrowLeft, Copy } from 'lucide-react'
import { Bouton } from '@/components/ui/bouton'
import { Message } from '@/components/ui/message'
import { SqueletteLignes } from '@/components/ui/squelette'
import { TexteMisEnForme } from '@/components/memoire/BlocsMemoire'

/** C1 — l'état d'une proposition : demandée, reçue, ou refusée par le serveur (la phrase du serveur). */
export type EtatProposition =
  | { etat: 'enCours'; sousCritere: string }
  | { etat: 'pret'; sousCritere: string; texte: string; section: string | null }
  | { etat: 'erreur'; sousCritere: string; message: string }

/**
 * C1 — « Proposer un paragraphe » (RELECTURE_PROPOSER) : le paragraphe proposé pour couvrir un sous-critère, dans le
 * tiroir de la relecture. Rien n'est écrit dans le mémoire : l'utilisateur le copie et le colle dans la partie, ou
 * revient à la relecture. Les passages « [À COMPLÉTER : …] » restent à renseigner, comme dans le mémoire.
 */
export default function PropositionParagraphe({ proposition, onRetour, onCopier, onReessayer }: {
  proposition: EtatProposition
  onRetour: () => void
  onCopier: (texte: string) => void
  onReessayer: () => void
}) {
  return (
    <div className="space-y-4" data-proposition-paragraphe={proposition.etat}>
      <Bouton variante="lien" onClick={onRetour} className="min-h-9">
        <ArrowLeft aria-hidden="true" /> Retour à la relecture
      </Bouton>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-fg">Paragraphe proposé</h3>
        <p className="break-words text-sm text-fg-2">Pour couvrir : {proposition.sousCritere}</p>
      </div>
      {proposition.etat === 'enCours' && (
        <div role="status" aria-busy="true">
          <span className="sr-only">Rédaction de la proposition…</span>
          <SqueletteLignes lignes={5} />
        </div>
      )}
      {proposition.etat === 'erreur' && (
        <Message ton="erreur" action={<Bouton variante="secondaire" onClick={onReessayer}>Réessayer</Bouton>}>
          {proposition.message}
        </Message>
      )}
      {proposition.etat === 'pret' && (
        <>
          <p className="whitespace-pre-wrap break-words border-l-2 border-bord pl-4 font-memoire text-base text-fg">
            <TexteMisEnForme texte={proposition.texte} />
          </p>
          <p className="text-xs text-fg-3">
            Rédigé à partir de Mon entreprise et du dossier, sans rien inventer. Relisez-le avant de l’insérer ; un passage à
            compléter reste à renseigner.
          </p>
          <div className="flex flex-wrap gap-2">
            <Bouton variante="principal" onClick={() => onCopier(proposition.texte)}>
              <Copy aria-hidden="true" /> {proposition.section ? 'Copier et aller à la partie' : 'Copier le paragraphe'}
            </Bouton>
            <Bouton variante="secondaire" onClick={onRetour}>Ne pas l’utiliser</Bouton>
          </div>
        </>
      )}
    </div>
  )
}
