import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Heading, Italic, List, ListOrdered, type LucideIcon } from 'lucide-react'
import { heureParis } from '@/lib/dateParis'
import { Bouton, BoutonIcone } from '@/components/ui/bouton'
import { DialogueConfirmation } from '@/components/ui/dialogue'
import { Infobulle } from '@/components/ui/infobulle'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import RewritePassageBar, { type PassageSelection } from '@/components/project/RewritePassageBar'
import { BlocMemoire } from '@/components/memoire/BlocsMemoire'
import { GESTES, appliquerGeste, type Geste } from '@/lib/memoireEdition'
import { assembler, decouper, remplacerBloc, type Bloc } from '@/lib/memoireBlocs'
import { depuisMarkdown, titresEditeur, versMarkdown } from '@/lib/memoireMarkdown'
import type { MemoireContent } from '@/types'

type EtatEnregistrement = 'enregistre' | 'en_cours' | 'echec'

const DELAI_ENREGISTREMENT_AUTO_MS = 3000
/** Les blocs dont le texte peut être réécrit ou changer de forme (un titre de partie, un filet, un tableau : non). */
const REECRIVABLES: ReadonlySet<Bloc['type']> = new Set<Bloc['type']>(['paragraphe', 'puce'])
const FORMABLES: ReadonlySet<Bloc['type']> = new Set<Bloc['type']>(['paragraphe', 'puce', 'titre'])
/** Les gestes de mise en forme : une icône par geste (son nom est dit au survol, au focus et au lecteur d'écran). */
const ICONES_GESTES: Record<Geste, LucideIcon> = { titre: Heading, gras: Bold, italique: Italic, liste: List, numeros: ListOrdered }

/**
 * L'éditeur du mémoire, en plein écran (la feuille du système : piège de focus, Échap, retour du focus). Le mémoire s'y lit
 * comme dans le document, titres en titres, gras en gras, tableaux en tableaux, et se corrige sur place : on clique un
 * paragraphe, une ligne de liste ou une cellule, on écrit. Aucun signe de mise en forme n'est montré.
 * Le texte enregistré garde son format (celui de `versMarkdown`, relu par `depuisMarkdown`) : l'écran le découpe en blocs qui
 * désignent ses lignes (`lib/memoireBlocs`). Un bloc non touché n'est jamais réécrit : ouvrir puis enregistrer rend le
 * texte au caractère près, et une correction ne change que les lignes de son bloc.
 * Enregistrement automatique trois secondes après la dernière frappe ; fermer avec des modifications demande confirmation.
 */
export default function EditeurMemoire({
  content, projectId, onSave, onClose,
}: {
  content: MemoireContent
  projectId: string
  /** Enregistre le mémoire relu depuis l'éditeur ; échoue (promesse rejetée) si le serveur refuse. */
  onSave: (contenu: MemoireContent) => Promise<void>
  onClose: () => void
}) {
  const structure = useMemo(() => titresEditeur(content), [content])
  const [blocs, setBlocs] = useState<Bloc[]>(() => decouper(versMarkdown(content), structure))
  // La frappe en cours dans un bloc : elle compte pour l'enregistrement, et rejoint les blocs quand on sort du bloc
  // (le découpage ne bouge pas sous le curseur).
  const [brouillon, setBrouillon] = useState<{ id: number; lignes: string[] } | null>(null)
  const raw = useMemo(
    () => assembler(brouillon ? blocs.map((b) => (b.id === brouillon.id ? { ...b, lignes: brouillon.lignes } : b)) : blocs),
    [blocs, brouillon],
  )
  // 1.8 — dernier texte confirmé par le serveur : sert à savoir s'il reste des modifications
  const [enregistre, setEnregistre] = useState(raw)
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre')
  const [heure, setHeure] = useState<Date | null>(null)
  const [confirmerFermeture, setConfirmerFermeture] = useState(false)
  // Le bloc où l'on écrit (il reste désigné quand on passe à la barre de réécriture).
  const [actif, setActif] = useState<number | null>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const enCoursRef = useRef(false)
  const structureRef = useRef(structure)
  structureRef.current = structure
  const modifie = raw !== enregistre

  const enregistrer = useCallback(async (texte: string): Promise<boolean> => {
    if (enCoursRef.current) return false
    enCoursRef.current = true
    setEtat('en_cours')
    try {
      await onSaveRef.current(depuisMarkdown(texte, content))
      setEnregistre(texte)
      setHeure(new Date())
      setEtat('enregistre')
      return true
    } catch {
      setEtat('echec')
      return false
    } finally {
      enCoursRef.current = false
    }
  }, [content])

  // Enregistrement automatique quelques secondes après la dernière frappe.
  useEffect(() => {
    if (raw === enregistre) return
    const minuteur = setTimeout(() => { void enregistrer(raw) }, DELAI_ENREGISTREMENT_AUTO_MS)
    return () => clearTimeout(minuteur)
  }, [raw, enregistre, enregistrer])

  // Fermeture de l'onglet avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!modifie) return
    const avertir = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avertir)
    return () => window.removeEventListener('beforeunload', avertir)
  }, [modifie])

  const fermer = () => {
    if (modifie || etat === 'en_cours') setConfirmerFermeture(true)
    else onClose()
  }

  const brouillonRef = useRef(brouillon)
  brouillonRef.current = brouillon
  const onSaisie = useCallback((id: number, lignes: string[]) => setBrouillon({ id, lignes }), [])
  const onEntree = useCallback((id: number) => setActif(id), [])
  const onSortie = useCallback((id: number) => {
    const b = brouillonRef.current
    if (!b || b.id !== id) return
    setBlocs((avant) => remplacerBloc(avant, id, b.lignes, structureRef.current))
    setBrouillon(null)
  }, [])

  const blocActif = actif === null ? null : blocs.find((b) => b.id === actif) ?? null
  /** Les lignes du bloc où l'on écrit, frappe en cours comprise. */
  const lignesActives = blocActif ? (brouillon && brouillon.id === blocActif.id ? brouillon.lignes : blocActif.lignes) : null
  // C9b — la réécriture agit sur le paragraphe où l'on écrit, et sur lui seul (`start` porte l'identité du bloc).
  const selection: PassageSelection | null = blocActif && lignesActives && REECRIVABLES.has(blocActif.type)
    ? { text: lignesActives.join('\n'), start: blocActif.id, end: blocActif.id }
    : null

  const applyRewrite = (id: number, _fin: number, rewritten: string) => {
    setBrouillon(null)
    setBlocs((avant) => remplacerBloc(avant, id, rewritten.split('\n'), structure))
    setActif(null)
  }

  // Un geste de la barre d'outils. Gras et italique agissent sur le passage choisi, là où l'on écrit ; Titre et les deux
  // listes changent la forme du bloc entier (les signes sont posés dans le texte enregistré, jamais à l'écran).
  const geste = (id: Geste) => {
    if (id === 'gras' || id === 'italique') { document.execCommand(id === 'gras' ? 'bold' : 'italic'); return }
    if (!blocActif || !lignesActives || !FORMABLES.has(blocActif.type)) return
    const texte = lignesActives.join('\n')
    const lignes = appliquerGeste(id, { texte, debut: 0, fin: texte.length }).texte.split('\n')
    setBrouillon(null)
    setBlocs((avant) => remplacerBloc(avant, blocActif.id, lignes, structure))
    setActif(null)
  }

  return (
    <Sheet open onOpenChange={(ouvert) => { if (!ouvert) fermer() }}>
      <SheetContent side="bottom" data-editeur-memoire="" className="top-0 flex h-dvh flex-col gap-0 border-t-0 bg-surface-0 p-0 [&>button:first-child]:hidden">
        {/* On quitte l'éditeur par « Terminé » (jury, tour 3 : une croix nue ne dit pas que le texte est gardé) : la croix
            de la feuille est retirée ici, Échap ferme toujours. L'enregistrement est dit une fois, par son état. */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-bord px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <SheetTitle className="font-memoire text-xl font-semibold text-fg">Modifier le mémoire</SheetTitle>
            <SheetDescription className="text-sm text-fg-2 max-md:sr-only">Corrigez le texte là où il se lit.</SheetDescription>
          </div>
          <p role="status" aria-live="polite" className="text-sm text-fg-2 max-md:order-last max-md:basis-full">
            {etat === 'en_cours' ? 'Enregistrement…'
              : modifie || etat === 'echec' ? <PastilleEtat sens="ambre">Modifications non enregistrées</PastilleEtat>
                : heure ? `Enregistré à ${heureParis(heure)}` : 'Tout est enregistré'}
          </p>
          <Bouton variante="secondaire" onClick={fermer}>Terminé</Bouton>
        </header>

        {etat === 'echec' && (
          <Message
            ton="erreur" className="mx-4 mt-3 shrink-0 sm:mx-6"
            action={<Bouton variante="secondaire" onClick={() => { void enregistrer(raw) }}>Réessayer</Bouton>}
          >
            L’enregistrement n’a pas abouti. Vos modifications restent ici.
          </Message>
        )}

        {/* Les outils : une rangée au-dessus du texte. Au téléphone, sous le texte, sans rien qui défile de côté : la
            réécriture du paragraphe choisi d'abord (au plus près du texte), la mise en forme en dernière rangée. */}
        <div data-outils-editeur="" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-bord px-4 py-1.5 max-md:order-last max-md:flex-col-reverse max-md:flex-nowrap max-md:items-stretch max-md:gap-y-2 max-md:border-b-0 max-md:border-t max-md:py-2 sm:px-6">
          <div role="toolbar" aria-label="Mise en forme" className="-mx-2 flex shrink-0 items-center gap-1">
            {GESTES.map((g) => {
              const Icone = ICONES_GESTES[g.id]
              return (
                <Infobulle key={g.id} texte={g.aide} cote="bottom">
                  {/* Le bouton ne prend pas le focus : le curseur reste dans le texte. */}
                  <BoutonIcone libelle={g.libelle} className="rounded-lg" onMouseDown={(e) => e.preventDefault()} onClick={() => geste(g.id)}>
                    <Icone aria-hidden strokeWidth={1.75} />
                  </BoutonIcone>
                </Infobulle>
              )
            })}
          </div>
          {/* C9b — réécriture ciblée (agit sur le paragraphe où l'on écrit, et sur lui seul) */}
          <RewritePassageBar projectId={projectId} selection={selection} onApply={applyRewrite} />
        </div>

        <div data-texte-memoire="" className="min-h-0 flex-1 overflow-y-auto px-5 py-8 max-md:py-6">
          <div className="lecteur-memoire mx-auto max-w-[72ch] text-lg leading-[1.7]">
            {blocs.map((b) => (
              <BlocMemoire key={b.id} bloc={b} actif={b.id === actif} onSaisie={onSaisie} onEntree={onEntree} onSortie={onSortie} />
            ))}
          </div>
        </div>

        <DialogueConfirmation
          ouvert={confirmerFermeture}
          onOuvert={setConfirmerFermeture}
          titre="Enregistrer avant de fermer ?"
          description="Des modifications ne sont pas encore enregistrées."
          libelleConfirmer="Enregistrer et fermer"
          libelleAnnuler="Continuer la rédaction"
          libelleEnCours="Enregistrement…"
          enCours={etat === 'en_cours'}
          onConfirmer={async () => { if (await enregistrer(raw)) onClose(); else setConfirmerFermeture(false) }}
        >
          <Bouton variante="lien" className="justify-self-start" onClick={onClose}>Fermer sans enregistrer</Bouton>
        </DialogueConfirmation>
      </SheetContent>
    </Sheet>
  )
}
