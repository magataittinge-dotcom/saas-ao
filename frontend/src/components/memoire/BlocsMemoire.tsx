import { Fragment, memo, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import {
  cellulesLigneTable, estNumerotee, estSeparateurTable, htmlFragments, lireFragments, niveauTitre, prefixeDe, remplacerCellule, retraitPuce,
  texteDeLaSaisie, type Bloc, type NoeudLu,
} from '@/lib/memoireBlocs'

/** Ce qu'un bloc dit à l'éditeur : « on écrit ici » (ses nouvelles lignes), « on y entre », « on en sort ». */
export interface GestesBloc {
  onSaisie: (id: number, lignes: string[]) => void
  onEntree: (id: number) => void
  onSortie: (id: number) => void
}

/** Un passage du mémoire lu sans ses signes (gras en gras, « À compléter » surligné) : l'avant et l'après d'une réécriture. */
export function TexteMisEnForme({ texte }: { texte: string }) {
  return (
    <>
      {texte.split('\n').map((ligne, i) => (
        <Fragment key={i}>
          {i > 0 && '\n'}
          {lireFragments(ligne.slice(prefixeDe(ligne).length)).map((f, k) => (
            f.type === 'gras' ? <strong key={k}>{f.texte}</strong>
              : f.type === 'italique' ? <em key={k}>{f.texte}</em>
                : f.type === 'a_completer' ? <mark key={k} className="a-renseigner">{f.texte}</mark>
                  : <Fragment key={k}>{f.texte}</Fragment>
          ))}
        </Fragment>
      ))}
    </>
  )
}

const inserer = (texte: string) => { document.execCommand('insertText', false, texte) }

/**
 * Une zone de saisie mise en forme : le texte s'y lit comme dans le document (gras en gras, « À compléter » surligné) et
 * s'y corrige sur place. Elle ne réécrit son contenu que si le texte reçu n'est plus celui qu'elle montre : la frappe ne
 * déplace jamais le curseur. Coller n'apporte que du texte.
 */
function Saisie({
  texte, nom, className, entree, onSaisie, onEntree, onSortie,
}: {
  texte: string
  nom: string
  className?: string
  /** Ce que fait la touche Entrée : un nouveau paragraphe, une nouvelle ligne de liste, ou sortir de la zone. */
  entree: 'paragraphe' | 'ligne' | 'sortir'
  onSaisie: (texte: string) => void
  onEntree: () => void
  onSortie: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && texteDeLaSaisie(el as unknown as NoeudLu) !== texte) el.innerHTML = htmlFragments(texte)
  }, [texte])

  const touche = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (entree === 'sortir') ref.current?.blur()
    else inserer(entree === 'paragraphe' && !e.shiftKey ? '\n\n' : '\n')
  }
  const coller = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    inserer(e.clipboardData.getData('text/plain').replace(/\r/g, ''))
  }

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline={entree !== 'sortir'}
      aria-label={nom}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      lang="fr"
      tabIndex={0}
      data-saisie=""
      className={cn('zone-saisie min-w-0 whitespace-pre-wrap break-words rounded-md outline-none', className)}
      onInput={() => { if (ref.current) onSaisie(texteDeLaSaisie(ref.current as unknown as NoeudLu)) }}
      onFocus={onEntree}
      onBlur={() => {
        const el = ref.current
        if (el) el.innerHTML = htmlFragments(texteDeLaSaisie(el as unknown as NoeudLu))
        onSortie()
      }}
      onKeyDown={touche}
      onPaste={coller}
    />
  )
}

const ZONE = '-mx-2 px-2 py-0.5 hover:bg-surface-1 focus:bg-surface-1'

/** Un paragraphe : Entrée ouvre un nouveau paragraphe (une ligne vide), Maj + Entrée passe à la ligne. */
const rangerParagraphe = (texte: string): string[] => texte.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '').split('\n')

function Tableau({ bloc, actif, onSaisie, onEntree, onSortie }: { bloc: Bloc; actif: boolean } & GestesBloc) {
  const lignes = bloc.lignes.map((ligne, r) => ({ ligne, r })).filter(({ ligne }) => !estSeparateurTable(ligne))
  const aDesTitres = bloc.lignes.length > 1 && estSeparateurTable(bloc.lignes[1])
  const entetes = aDesTitres ? cellulesLigneTable(bloc.lignes[0]).map((c) => c.texte.replace(/[*_`#]/g, '').trim()) : []
  return (
    <div data-bloc="table" data-actif={actif || undefined} className="my-4 overflow-x-auto max-md:overflow-visible">
      {/* Un tableau en rangées et en cellules (rôles dits au lecteur d'écran) : chaque cellule est une zone de saisie. */}
      <div role="table" className="table w-full border-collapse text-left font-sans text-sm max-md:block">
        <div role="rowgroup" className="table-row-group max-md:grid max-md:gap-3">
          {lignes.map(({ ligne, r }) => {
            const titre = aDesTitres && r === 0
            return (
              <div role="row" key={r} className={cn('table-row max-md:grid max-md:rounded-lg max-md:border max-md:border-bord-2', titre && 'max-md:hidden')}>
                {cellulesLigneTable(ligne).map((c, k) => (
                  <div
                    role={titre ? 'columnheader' : 'cell'}
                    key={c.morceau}
                    data-colonne={titre ? undefined : entetes[k]}
                    className={cn(
                      'table-cell border border-bord-2 p-0 align-top max-md:block max-md:border-0 max-md:border-b max-md:last:border-b-0',
                      titre ? 'bg-surface-2 font-semibold text-fg' : 'text-fg-2 max-md:before:block max-md:before:px-3 max-md:before:pt-2 max-md:before:text-xs max-md:before:font-semibold max-md:before:text-fg-3 max-md:before:content-[attr(data-colonne)]',
                    )}
                  >
                    <Saisie
                      texte={c.texte}
                      nom={titre ? 'Titre de colonne' : entetes[k] ? `${entetes[k]}, ligne ${aDesTitres ? r - 1 : r + 1}` : 'Cellule du tableau'}
                      entree="sortir"
                      className="min-h-9 rounded-none px-3 py-2 focus:bg-surface-1"
                      onSaisie={(t) => onSaisie(bloc.id, bloc.lignes.map((l, i) => (i === r ? remplacerCellule(l, c.morceau, t) : l)))}
                      onEntree={() => onEntree(bloc.id)}
                      onSortie={() => onSortie(bloc.id)}
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Le retrait d'une ligne de liste, selon son niveau. */
const RETRAITS = ['pl-0', 'pl-6', 'pl-12', 'pl-16']

/**
 * Un bloc du mémoire dans l'éditeur. Les titres de partie et de section se lisent et ne se modifient pas (ils découpent le
 * mémoire) ; tout le reste se corrige sur place, sans aucun signe de mise en forme à l'écran.
 */
function BlocMemoireBrut({ bloc, actif, onSaisie, onEntree, onSortie }: { bloc: Bloc; actif: boolean } & GestesBloc) {
  const ligne = bloc.lignes[0]
  const gestes = { onEntree: () => onEntree(bloc.id), onSortie: () => onSortie(bloc.id) }
  switch (bloc.type) {
    case 'vide':
    case 'cloture':
      return null
    case 'filet':
      return <hr className="my-10 border-bord" />
    case 'structure': {
      const texte = ligne.slice(prefixeDe(ligne).length)
      return niveauTitre(ligne) === 1
        ? <h2 data-bloc="partie" className="mb-6 mt-2 font-sans text-sm font-semibold text-fg-3">{texte}</h2>
        : <h3 data-bloc="section" className="mb-3 mt-10 font-memoire text-xl font-semibold leading-snug text-fg">{texte}</h3>
    }
    case 'titre': {
      const prefixe = prefixeDe(ligne)
      return (
        <Saisie
          texte={ligne.slice(prefixe.length)} nom="Intertitre" entree="sortir" {...gestes}
          className={cn(ZONE, 'mb-1.5 mt-7 font-semibold leading-snug text-fg', 'text-lg')}
          onSaisie={(t) => { const net = t.replace(/\n+/g, ' ').trim(); onSaisie(bloc.id, [net ? `${prefixe}${net}` : '']) }}
        />
      )
    }
    case 'puce': {
      const prefixe = prefixeDe(ligne)
      const numero = estNumerotee(ligne) ? prefixe.trim() : null
      return (
        <div data-bloc="puce" data-actif={actif || undefined} className={cn('my-1 flex gap-2.5', RETRAITS[Math.min(retraitPuce(ligne), RETRAITS.length - 1)])}>
          <span aria-hidden="true" className={cn('shrink-0 select-none py-0.5 text-fg-3', numero ? 'min-w-5 text-right' : 'w-3 text-center')}>{numero ?? '•'}</span>
          <Saisie
            texte={ligne.slice(prefixe.length)} nom="Ligne de liste" entree="ligne" {...gestes}
            className={cn(ZONE, 'flex-1 text-fg-2')}
            onSaisie={(t) => {
              const nettes = t.split('\n').map((l) => l.trim()).filter(Boolean)
              onSaisie(bloc.id, nettes.length ? nettes.map((l) => `${prefixe}${l}`) : [''])
            }}
          />
        </div>
      )
    }
    case 'table':
      return <Tableau bloc={bloc} actif={actif} onSaisie={onSaisie} onEntree={onEntree} onSortie={onSortie} />
    case 'paragraphe':
      return (
        <Saisie
          texte={bloc.lignes.join('\n')} nom="Paragraphe" entree="paragraphe" {...gestes}
          className={cn(ZONE, 'my-3 text-fg-2')}
          onSaisie={(t) => onSaisie(bloc.id, rangerParagraphe(t))}
        />
      )
  }
}

/** Un bloc ne se redessine que si ses lignes changent : écrire dans un paragraphe ne touche pas les autres. */
export const BlocMemoire = memo(BlocMemoireBrut, (a, b) => a.bloc === b.bloc && a.actif === b.actif)
