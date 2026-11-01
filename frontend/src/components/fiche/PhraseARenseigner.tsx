import { Link } from 'react-router-dom'
import { phraseARenseigner, type RubriqueFiche } from '@/lib/fiche'

/**
 * Au-dessus de l'aperçu : « 3 informations à renseigner dans Mon entreprise pour compléter cette fiche », avec un lien vers
 * la rubrique. Absente quand il n'en reste aucune. Elle ne figure jamais dans le PDF ni dans le Word : un document remis à
 * un acheteur n'a pas de trous, c'est l'aperçu qui dit ce qui reste à saisir.
 */
export default function PhraseARenseigner({ n, rubrique }: { n: number; rubrique: RubriqueFiche }) {
  const phrase = phraseARenseigner(n)
  if (!phrase) return null
  return (
    <p data-a-renseigner className="text-sm text-fg-2">
      {phrase.avant}
      <Link to={`/company?rubrique=${rubrique}`} className="font-medium text-accent-text underline-offset-2 hover:underline">{phrase.lien}</Link>
      {phrase.apres}
    </p>
  )
}
