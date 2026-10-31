// Un sigle de la commande publique (DCE, RC, CCAP…) : développé à sa première apparition sur chaque écran
// (« le dossier de l'acheteur (DCE) »), abrégé ensuite (« le DCE »), avec une infobulle d'une ligne tirée du
// lexique sourcé (lib/lexique.ts). Accessible au clavier (bouton), cible de 44 px au toucher (cible-etendue).
//
// « Écran » = une PorteeSigles. Le Layout en pose une par adresse ; une page hors du Layout (accueil public)
// pose la sienne. Sans portée, le sigle est toujours développé : un sigle n'est jamais laissé sans explication.
import { createContext, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { LEXIQUE, nomSigle, type CodeSigle } from '@/lib/lexique'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Qui a réclamé « première apparition » pour chaque sigle, sur un écran. */
class Portee {
  private premiers = new Map<CodeSigle, string>()
  private abonnes = new Set<() => void>()
  private version = 0

  /** Vrai si `id` est (ou devient) le premier à afficher ce sigle. Idempotent : sûr à rejouer au rendu. */
  reclamer(code: CodeSigle, id: string): boolean {
    if (!this.premiers.has(code)) this.premiers.set(code, id)
    return this.premiers.get(code) === id
  }

  /** Le premier disparaît de l'écran : le suivant prend le développement. */
  liberer(code: CodeSigle, id: string): void {
    if (this.premiers.get(code) !== id) return
    this.premiers.delete(code)
    this.version += 1
    this.abonnes.forEach((f) => f())
  }

  abonner = (f: () => void) => {
    this.abonnes.add(f)
    return () => {
      this.abonnes.delete(f)
    }
  }

  instantane = () => this.version
}

const ContextePortee = createContext<Portee | null>(null)
const sansAbonnement = () => () => {}
const zero = () => 0

/** Un écran : le premier <Sigle code="…"> de chaque sigle y est développé, les suivants abrégés.
 *  `cle` (l'adresse de l'écran) repart à zéro quand elle change, sans remonter les enfants. */
export function PorteeSigles({ cle, children }: { cle?: string; children: ReactNode }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const portee = useMemo(() => new Portee(), [cle])
  return <ContextePortee.Provider value={portee}>{children}</ContextePortee.Provider>
}

interface Props {
  code: CodeSigle
  /** Début de phrase : « Dossier de l'acheteur (DCE) ». */
  majuscule?: boolean
}

export function Sigle({ code, majuscule = false }: Props) {
  const entree = LEXIQUE[code]
  const portee = useContext(ContextePortee)
  const id = useId()
  useSyncExternalStore(portee?.abonner ?? sansAbonnement, portee?.instantane ?? zero, zero)
  const premier = portee ? portee.reclamer(code, id) : true
  useEffect(() => () => portee?.liberer(code, id), [portee, code, id])
  const [ouvert, setOuvert] = useState(false)

  const developpe = majuscule ? entree.developpe.charAt(0).toUpperCase() + entree.developpe.slice(1) : entree.developpe
  const bouton = (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={ouvert} onOpenChange={setOuvert}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={nomSigle(code)}
            // Au toucher, un appui ouvre l'infobulle et la laisse ouverte (Radix la fermerait au clic).
            onClick={(e) => {
              e.preventDefault()
              setOuvert(true)
            }}
            className="cible-libre cible-etendue cursor-help rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            {code}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 whitespace-normal text-pretty font-normal">{entree.explication}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  if (!premier) return bouton
  return (
    <>
      {developpe} ({bouton})
    </>
  )
}
