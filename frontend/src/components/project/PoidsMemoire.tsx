/** Part de la note hors prix, telle que le règlement de consultation la chiffre.
 *  Si le RC ne donne pas de pondération, aucun chiffre n'est affiché (1.4). */
export default function PoidsMemoire({ techPct }: { techPct: number }) {
  if (techPct <= 0) {
    return <p className="text-sm font-medium text-fg">Aucune pondération relevée dans le règlement de consultation.</p>
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="chiffres text-xl font-semibold text-fg">{techPct}&nbsp;%</span>
      <span className="text-sm text-fg-2">
        de votre note se joue dans ce document <span className="text-fg-3">· pondération hors prix relevée dans le règlement de consultation</span>
      </span>
    </p>
  )
}
