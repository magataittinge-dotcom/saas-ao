import { useCallback, useEffect, useRef, useState } from 'react'
import { heureParis } from '@/lib/dateParis'
import { Bouton } from '@/components/ui/bouton'
import { ZoneTexte } from '@/components/ui/champ'
import { DialogueConfirmation } from '@/components/ui/dialogue'
import { Infobulle } from '@/components/ui/infobulle'
import { Message } from '@/components/ui/message'
import { PastilleEtat } from '@/components/ui/pastille'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import RewritePassageBar, { type PassageSelection } from '@/components/project/RewritePassageBar'
import { GESTES, appliquerGeste, type Geste } from '@/lib/memoireEdition'
import { depuisMarkdown, versMarkdown } from '@/lib/memoireMarkdown'
import type { MemoireContent } from '@/types'

type EtatEnregistrement = 'enregistre' | 'en_cours' | 'echec'

const DELAI_ENREGISTREMENT_AUTO_MS = 3000

/**
 * L'éditeur du mémoire, en plein écran (la feuille du système : piège de focus, Échap, retour du focus). Une surface
 * d'écriture, pas une zone de code : le texte en Newsreader 17 px sur une colonne de 72 caractères, une barre d'outils en
 * mots (Titre, Gras, Italique, Liste, Liste numérotée) qui pose les signes à la place de l'utilisateur, une ligne qui les
 * explique, puis la réécriture ciblée (Reformuler, Plus technique, Plus concis, Insister sur…).
 * Le modèle de données ne change pas : le texte reste celui de `versMarkdown`, relu par `depuisMarkdown`.
 * Enregistrement automatique trois secondes après la dernière frappe ; « Modifications non enregistrées » tant que le
 * serveur n'a pas confirmé ; fermer avec des modifications demande confirmation.
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
  const [raw, setRaw] = useState(() => versMarkdown(content))
  // 1.8 — dernier texte confirmé par le serveur : sert à savoir s'il reste des modifications
  const [enregistre, setEnregistre] = useState(raw)
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre')
  const [heure, setHeure] = useState<Date | null>(null)
  const [confirmerFermeture, setConfirmerFermeture] = useState(false)
  // C9b — sélection courante dans la zone de texte (pour la réécriture ciblée)
  const [selection, setSelection] = useState<PassageSelection | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const enCoursRef = useRef(false)
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

  const captureSelection = () => {
    const el = editorRef.current
    if (!el) return
    const { selectionStart, selectionEnd } = el
    if (selectionEnd > selectionStart) {
      setSelection({ text: raw.slice(selectionStart, selectionEnd), start: selectionStart, end: selectionEnd })
    } else {
      setSelection(null)
    }
  }

  const applyRewrite = (start: number, end: number, rewritten: string) => {
    setRaw((prev) => prev.slice(0, start) + rewritten + prev.slice(end))
    setSelection(null)
  }

  // Un geste de la barre d'outils : il pose les signes autour de la sélection, puis rend la main au texte.
  const geste = (id: Geste) => {
    const el = editorRef.current
    if (!el) return
    const suite = appliquerGeste(id, { texte: raw, debut: el.selectionStart, fin: el.selectionEnd })
    setRaw(suite.texte)
    setSelection(null)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(suite.debut, suite.fin) })
  }

  return (
    <Sheet open onOpenChange={(ouvert) => { if (!ouvert) fermer() }}>
      <SheetContent side="bottom" data-editeur-memoire="" className="top-0 flex h-dvh flex-col gap-0 border-t-0 bg-surface-0 p-0">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-bord px-4 py-3 pr-14 sm:px-6 sm:pr-16">
          <div className="min-w-0">
            <SheetTitle className="text-lg font-semibold text-fg">Modifier le texte</SheetTitle>
            <SheetDescription className="text-sm text-fg-2">Le mémoire entier, partie par partie. Il s’enregistre seul pendant que vous écrivez.</SheetDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" aria-live="polite" className="text-sm text-fg-2">
              {etat === 'en_cours' ? 'Enregistrement…'
                : modifie || etat === 'echec' ? <PastilleEtat sens="ambre">Modifications non enregistrées</PastilleEtat>
                  : heure ? `Enregistré à ${heureParis(heure)}` : 'Aucune modification'}
            </p>
            <Bouton variante="principal" onClick={() => { void enregistrer(raw) }} disabled={!modifie} enCours={etat === 'en_cours'} libelleEnCours="Enregistrement…">
              Enregistrer
            </Bouton>
          </div>
        </header>

        {etat === 'echec' && (
          <Message
            ton="erreur" className="mx-4 mt-3 shrink-0 sm:mx-6"
            action={<Bouton variante="secondaire" onClick={() => { void enregistrer(raw) }}>Réessayer</Bouton>}
          >
            L’enregistrement n’a pas abouti. Vos modifications restent ici.
          </Message>
        )}

        <div className="shrink-0 space-y-2 border-b border-bord px-4 py-2 sm:px-6">
          <div role="toolbar" aria-label="Mise en forme" className="-mx-3 flex flex-wrap items-center gap-x-1">
            {GESTES.map((g) => (
              <Infobulle key={g.id} texte={g.aide} cote="bottom">
                <Bouton variante="discret" onClick={() => geste(g.id)}>{g.libelle}</Bouton>
              </Infobulle>
            ))}
            <p className="px-3 text-xs text-fg-3 max-lg:basis-full max-lg:pb-1 lg:ml-auto">
              {'# = titre, **texte** = gras'} : les boutons posent ces signes pour vous.
            </p>
          </div>
          {/* C9b — réécriture ciblée (agit sur la sélection seule) */}
          <RewritePassageBar projectId={projectId} selection={selection} onApply={applyRewrite} />
        </div>

        <ZoneTexte
          ref={editorRef}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setSelection(null) }}
          onSelect={captureSelection}
          aria-label="Texte du mémoire"
          className="min-h-0 flex-1 resize-none rounded-none border-0 bg-surface-0 px-[max(1.25rem,calc((100%-72ch)/2))] py-8 font-memoire text-lg leading-[1.7] text-fg hover:border-0 focus-visible:outline-none max-[768px]:text-lg"
          spellCheck
          lang="fr"
        />

        <DialogueConfirmation
          ouvert={confirmerFermeture}
          onOuvert={setConfirmerFermeture}
          titre="Enregistrer avant de fermer ?"
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
