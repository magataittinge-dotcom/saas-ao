/** Part de la note hors prix, telle que le règlement de consultation la chiffre.
 *  Si le RC ne donne pas de pondération, aucun chiffre n'est affiché (1.4). */
export default function PoidsMemoire({ techPct }: { techPct: number }) {
  if (techPct <= 0) {
    return (
      <p className="text-sm font-semibold" style={{ color: '#F7F8F8' }}>
        Aucune pondération relevée dans le règlement de consultation.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <span className="num-mono bg-gradient-silver-text bg-clip-text text-5xl font-bold leading-none text-transparent">
        {techPct}&nbsp;%
      </span>
      <div className="pb-0.5">
        <p className="text-sm font-semibold" style={{ color: '#F7F8F8' }}>
          de votre note se joue dans ce document
        </p>
        <p className="mt-0.5 text-xs" style={{ color: '#959597' }}>
          pondération hors prix relevée dans le règlement de consultation
        </p>
      </div>
    </div>
  )
}
