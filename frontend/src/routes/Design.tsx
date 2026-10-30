import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Archive, Bell, Briefcase, Building2, Check, FileText, FolderOpen, Info, Plus, Search, Settings, Users } from 'lucide-react'
import { Badge, Pastille } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { rapportContraste } from '@/lib/contraste'
import { cn } from '@/lib/utils'

// Page de référence interne (/design, non liée au menu) : tous les jetons et composants du système, en clair
// et en nuit côte à côte. Chaque exemple est rendu deux fois, dans une portée data-theme="light" et une portée
// data-theme="dark" : les valeurs affichées sont lues sur l'élément (getComputedStyle), pas recopiées.
// Les fenêtres, tiroirs et infobulles s'ouvrent dans le thème courant de l'application (bascule en haut à droite).

function Cote({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 min-[1100px]:grid-cols-2">
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} data-theme={theme} className="min-w-0 rounded-carte border border-bord-2 bg-surface-0 p-5 text-fg-2">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-fg-3">{theme === 'light' ? 'Clair' : 'Nuit'}</p>
          {children}
        </div>
      ))}
    </div>
  )
}

function Section({ id, titre, note, children }: { id: string; titre: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-20 space-y-4">
      <div>
        <h2 id={`${id}-t`} className="text-2xl text-fg">{titre}</h2>
        {note && <p className="mt-1 max-w-3xl text-sm text-fg-2">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** Valeur d'un jeton, lue sur l'élément dans sa portée de thème. */
function useJeton(jeton: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [valeur, setValeur] = useState('')
  useLayoutEffect(() => {
    if (ref.current) setValeur(getComputedStyle(ref.current).getPropertyValue(jeton).trim())
  }, [jeton])
  return { ref, valeur }
}

function Echantillon({ jeton, fond }: { jeton: string; fond?: string }) {
  const { ref, valeur } = useJeton(jeton)
  return (
    <div className="min-w-0">
      <div ref={ref} className="h-12 rounded-md border border-bord-2" style={{ background: fond ?? `var(${jeton})` }} />
      <p className="mt-1.5 truncate text-xs font-medium text-fg">{jeton.replace(/^--/, '')}</p>
      <p className="truncate text-xs text-fg-3">{valeur}</p>
    </div>
  )
}

const PALETTES: [string, string[]][] = [
  ['Surfaces', ['--surface-0', '--surface-1', '--surface-2', '--surface-dark', '--surface-pop']],
  ['Textes', ['--text-1', '--text-2', '--text-3', '--text-disabled']],
  ['Bordures', ['--border-1', '--border-2', '--border-field']],
  ['Accent (échelle)', ['--accent-50', '--accent-100', '--accent-200', '--accent-300', '--accent-400', '--accent-500', '--accent-600', '--accent-700', '--accent-800', '--accent-900']],
  ['Accent (rôles)', ['--accent-text', '--accent-ui', '--accent-ring', '--accent-fill', '--accent-tint', '--accent-tint-2']],
  ['Information', ['--info-bg', '--info-border', '--info-fg']],
  ['Succès', ['--success-bg', '--success-border', '--success-fg']],
  ['Avertissement', ['--warning-bg', '--warning-border', '--warning-fg']],
  ['Erreur bloquante', ['--danger-bg', '--danger-border', '--danger-fg', '--danger-solid']],
  ['Surlignage de la preuve', ['--highlight', '--highlight-soft']],
]

const PAIRES: [string, string, string][] = [
  ['Texte principal', '--text-1', '--surface-0'],
  ['Texte secondaire', '--text-2', '--surface-1'],
  ['Texte discret', '--text-3', '--surface-2'],
  ['Lien et accent', '--accent-text', '--surface-0'],
  ['Texte du bouton plein', '--on-accent', '--accent-600'],
  ['Information', '--info-fg', '--info-bg'],
  ['Succès', '--success-fg', '--success-bg'],
  ['Avertissement', '--warning-fg', '--warning-bg'],
  ['Erreur', '--danger-fg', '--danger-bg'],
  ['Bord des champs (interface, 3:1)', '--border-field', '--surface-0'],
  ['Anneau de focus (interface, 3:1)', '--accent-ring', '--surface-1'],
]

function TableContrastes() {
  const ref = useRef<HTMLTableElement>(null)
  const [lignes, setLignes] = useState<{ nom: string; r: number | null; seuil: number }[]>([])
  useLayoutEffect(() => {
    if (!ref.current) return
    const s = getComputedStyle(ref.current)
    setLignes(PAIRES.map(([nom, a, b]) => ({ nom, r: rapportContraste(s.getPropertyValue(a), s.getPropertyValue(b)), seuil: /interface/.test(nom) ? 3 : 4.5 })))
  }, [])
  return (
    <table ref={ref} className="w-full text-sm">
      <thead><tr className="text-left text-xs text-fg-3"><th className="pb-2 font-medium">Paire</th><th className="pb-2 text-right font-medium">Rapport</th><th className="pb-2 pl-3 font-medium">Seuil</th></tr></thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.nom} className="border-t border-bord">
            <td className="py-1.5 pr-2 text-fg">{l.nom}</td>
            <td className="py-1.5 text-right tabular-nums text-fg">{l.r === null ? '—' : l.r.toFixed(2)}</td>
            <td className="py-1.5 pl-3"><Badge variant={l.r !== null && l.r >= l.seuil ? 'success' : 'warning'}>{l.seuil}:1{l.r !== null && l.r >= l.seuil ? ' tenu' : ''}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ECHELLE: [string, string, string][] = [
  ['h1', 'text-h1', 'Réponse aux appels d’offres'],
  ['h2', 'text-h2', 'Un dossier complet'],
  ['h3', 'text-h3', 'Analyse du DCE'],
  ['h5', 'text-h5', 'Pièces de candidature'],
  ['h6', 'text-h6', 'Mémoire technique'],
]

function Mouvement() {
  const [lecture, setLecture] = useState(0)
  const courbes: [string, string, string][] = [
    ['reveal', 'ease-reveal', 'Apparition : ressort sans dépassement, 600 à 1000 ms'],
    ['pop', 'ease-pop', 'Infobulles et menus : léger dépassement, 280 ms'],
    ['expo', 'ease-expo', 'Pression et rayon : 100 à 450 ms'],
    ['lien', 'ease-link', 'Liens : 400 ms'],
  ]
  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={() => setLecture((n) => n + 1)}>Rejouer</Button>
      {courbes.map(([nom, ease, texte]) => (
        <div key={nom} className="flex items-center gap-3">
          <div className="relative h-8 w-40 shrink-0 overflow-hidden rounded-pilule bg-surface-1">
            {/* transform seulement ; sous prefers-reduced-motion la règle globale rend le déplacement instantané */}
            <span key={lecture} className={cn('absolute left-1 top-1 size-6 rounded-full bg-accent-fill', 'animate-[deplacer_1000ms_both]')} style={{ animationTimingFunction: `var(--${ease})` }} />
          </div>
          <p className="text-xs text-fg-2"><span className="font-medium text-fg">{ease}</span> — {texte}</p>
        </div>
      ))}
    </div>
  )
}

export default function Design() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-12 pb-12">
      <header className="space-y-2">
        <h1 className="text-h5 text-fg">Système de design</h1>
        <p className="max-w-3xl text-sm text-fg-2">
          Page interne, non liée au menu. Jetons et composants du socle, en clair et en nuit. Les valeurs viennent de{' '}
          <code className="rounded-xs bg-surface-1 px-1 text-xs text-fg">styles/theme.css</code> ; les fenêtres, tiroirs et infobulles s’ouvrent dans le thème courant (bascule en haut à droite).
        </p>
        <nav aria-label="Sections" className="flex flex-wrap gap-2 pt-1">
          {['couleurs', 'contrastes', 'typographie', 'formes', 'boutons', 'champs', 'cartes', 'pastilles', 'onglets', 'surcouches', 'mouvement', 'icones'].map((id) => (
            <a key={id} href={`#${id}`} className="rounded-pilule bg-surface-1 px-3 py-1.5 text-sm text-fg-2 transition-colors hover:text-fg">{id}</a>
          ))}
        </nav>
      </header>

      <Section id="couleurs" titre="Couleurs" note="Accent bleu (teinte 251,7°), nuit neutre #111111. Le texte d’accent est accent-700 en clair et accent-300 en nuit ; jamais de texte foncé sur un accent vif.">
        <Cote>
          <div className="space-y-5">
            {PALETTES.map(([nom, jetons]) => (
              <div key={nom}>
                <h3 className="mb-2 text-sm text-fg">{nom}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
                  {jetons.map((j) => <Echantillon key={j} jeton={j} />)}
                </div>
              </div>
            ))}
          </div>
        </Cote>
      </Section>

      <Section id="contrastes" titre="Contrastes" note="Rapports lus à l’écran sur les valeurs calculées ; le test tests/jetons.test.ts les garde (texte 4,5:1, interface 3:1).">
        <Cote><TableContrastes /></Cote>
      </Section>

      <Section id="typographie" titre="Typographie" note="Titres en Bricolage Grotesque (600), interface et texte en Inter, données en Geist Mono. Échelle de bureau ; elle se réduit sous 810 px.">
        <Cote>
          <div className="space-y-4">
            {ECHELLE.map(([nom, classe, texte]) => (
              <div key={nom} className="flex items-baseline gap-3 overflow-hidden">
                <span className="w-7 shrink-0 text-xs text-fg-3">{nom}</span>
                <p className={cn('truncate font-display text-fg', classe)}>{texte}</p>
              </div>
            ))}
            <p className="text-lead text-fg">Texte d’introduction, Inter 20 / 26, graisse 500.</p>
            <p className="text-long text-fg-2">Texte long, Inter 18 / 30,6. Le DCE est lu pièce par pièce ; chaque exigence garde sa source.</p>
            <p className="text-sm text-fg-2">Petit texte, 14 px. Les montants et références utilisent la classe <span className="edge-data text-fg">edge-data</span> : 1 234,50 € · lot 03.</p>
            <p className="text-micro text-fg-3">Légende, 12 px.</p>
          </div>
        </Cote>
      </Section>

      <Section id="formes" titre="Rayons, ombres, verre" note="Rayons 4 / 8 / 12 / 16 / 20 / 30 / pilule. Ombres relevées sur le site de référence ; le verre reste limité à l’en-tête, aux infobulles et aux voiles.">
        <Cote>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              {[['xs', 'rounded-xs'], ['sm', 'rounded-sm'], ['md', 'rounded-md'], ['lg', 'rounded-lg'], ['xl', 'rounded-carte'], ['2xl', 'rounded-section'], ['pilule', 'rounded-pilule']].map(([nom, classe]) => (
                <div key={nom} className="text-center"><div className={cn('size-16 border border-bord-2 bg-surface-1', classe)} /><p className="mt-1 text-xs text-fg-3">{nom}</p></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[['carte', 'shadow-card'], ['pop', 'shadow-pop'], ['toast', 'shadow-toast'], ['cta', 'shadow-cta']].map(([nom, classe]) => (
                <div key={nom} className={cn('grid h-16 place-items-center rounded-lg bg-surface-0 text-xs text-fg-2', classe)}>{nom}</div>
              ))}
            </div>
            <div className="relative h-24 overflow-hidden rounded-carte bg-accent-fill">
              <div className="absolute inset-3 grid place-items-center rounded-lg border border-bord bg-[var(--glass-fill)] text-sm text-fg backdrop-blur-md">Verre : fond translucide, flou 16 px</div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {['4', '8', '10', '12', '16', '20', '30', '40'].map((n) => (
                <div key={n} className="text-center"><div className="bg-accent-ui" style={{ width: `${n}px`, height: `${n}px` }} /><p className="mt-1 text-xs text-fg-3">{n}</p></div>
              ))}
            </div>
          </div>
        </Cote>
      </Section>

      <Section id="boutons" titre="Boutons" note="Un seul bouton signature (dégradé et halo) par écran. États : repos, survol, actif, focus (Tab), désactivé. Cible tactile de 44 px sur écran tactile.">
        <Cote>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Enregistrer</Button>
              <Button variant="signature">Nouvel AO<Plus aria-hidden /></Button>
              <Button variant="secondary">Secondaire</Button>
              <Button variant="outline">Contour</Button>
              <Button variant="ghost">Discret</Button>
              <Button variant="destructive">Supprimer</Button>
              <Button variant="link">Lien</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Petit</Button>
              <Button size="lg">Grand</Button>
              <Button size="icon" aria-label="Ajouter"><Plus aria-hidden /></Button>
              <Button disabled>Désactivé</Button>
              <Button variant="outline" disabled>Désactivé</Button>
            </div>
          </div>
        </Cote>
      </Section>

      <Section id="champs" titre="Champs" note="Bord à 3:1, survol plus marqué, focus = bord et anneau de l’accent, erreur par aria-invalid, désactivé.">
        <Cote>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm text-fg"><span>Raison sociale</span><Input placeholder="Nom de l’entreprise" /></label>
            <label className="space-y-1.5 text-sm text-fg"><span>SIRET</span><Input defaultValue="123 456 789 00012" /></label>
            <label className="space-y-1.5 text-sm text-fg"><span>Date limite</span><Input aria-invalid="true" defaultValue="31/02/2026" /><span className="block text-xs text-danger">Cette date n’existe pas.</span></label>
            <label className="space-y-1.5 text-sm text-fg"><span>Référence</span><Input disabled defaultValue="Renseignée par Synorix" /></label>
            <label className="space-y-1.5 text-sm text-fg sm:col-span-2"><span>Moyens techniques</span><Textarea placeholder="Matériel, effectifs, certifications…" /></label>
          </div>
        </Cote>
      </Section>

      <Section id="cartes" titre="Cartes" note="Surface-1, rayon 20, sans trait : les surfaces se séparent par le fond.">
        <Cote>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Réhabilitation d’une salle des fêtes</CardTitle><CardDescription>Commune de démonstration</CardDescription></CardHeader>
              <CardContent className="text-sm text-fg-2">Remise des offres le 12 novembre 2026.</CardContent>
            </Card>
            <Card interactive tabIndex={0}>
              <CardHeader><CardTitle>Carte cliquable</CardTitle><CardDescription>Survol et focus</CardDescription></CardHeader>
              <CardContent className="text-sm text-fg-2">Toute la carte ouvre l’appel d’offres.</CardContent>
            </Card>
          </div>
        </Cote>
      </Section>

      <Section id="pastilles" titre="Pastilles" note="« À joindre », « À confirmer », « Facultatif » : ton information. « À renouveler » : avertissement. « Prêt » : succès. Le rouge est réservé à l’erreur bloquante.">
        <Cote>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>Brouillon</Badge><Badge variant="accent">Nouveau</Badge><Badge variant="info">À joindre</Badge><Badge variant="info">À confirmer</Badge>
              <Badge variant="success"><Check size={12} aria-hidden />Prêt</Badge><Badge variant="warning">À renouveler</Badge><Badge variant="danger">Remise dépassée</Badge><Badge variant="outline">Facultatif</Badge>
            </div>
            <div className="flex items-center gap-6">
              <span className="relative grid size-11 place-items-center rounded-pilule bg-surface-1 text-fg-2"><FolderOpen size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden /><span className="absolute -right-0.5 -top-0.5"><Pastille valeur={3} /></span></span>
              <span className="relative grid size-11 place-items-center rounded-pilule bg-surface-1 text-fg-2"><Bell size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden /><span className="absolute right-1 top-1"><Pastille ton="accent" /></span></span>
              <span className="text-sm text-fg-2">Pastilles sur icône : compteur et point.</span>
            </div>
          </div>
        </Cote>
      </Section>

      <Section id="onglets" titre="Onglets" note="Flèches gauche et droite, Origine et Fin au clavier (Radix).">
        <Cote>
          <Tabs defaultValue="identite">
            <TabsList><TabsTrigger value="identite">Identité</TabsTrigger><TabsTrigger value="moyens">Moyens</TabsTrigger><TabsTrigger value="certifications">Certifications</TabsTrigger></TabsList>
            <TabsContent value="identite" className="text-sm text-fg-2">Raison sociale, SIRET, effectif.</TabsContent>
            <TabsContent value="moyens" className="text-sm text-fg-2">Matériel et équipes.</TabsContent>
            <TabsContent value="certifications" className="text-sm text-fg-2">Qualibat, MASE, ISO.</TabsContent>
          </Tabs>
        </Cote>
      </Section>

      <Section id="surcouches" titre="Infobulle, fenêtre, tiroir" note="Ouverts dans le thème courant de l’application.">
        <div className="flex flex-wrap items-center gap-3">
          <Tooltip><TooltipTrigger asChild><Button variant="outline"><Info aria-hidden />Infobulle</Button></TooltipTrigger><TooltipContent>Verre dépoli, ressort à dépassement</TooltipContent></Tooltip>
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Fenêtre</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Supprimer cet appel d’offres ?</DialogTitle><DialogDescription>Le dossier et ses pièces seront retirés de votre compte.</DialogDescription></DialogHeader>
              <div className="flex justify-end gap-2"><Button variant="ghost">Annuler</Button><Button variant="destructive">Supprimer</Button></div>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger asChild><Button variant="outline">Tiroir</Button></SheetTrigger>
            <SheetContent side="right"><SheetHeader><SheetTitle className="font-display">Voir dans le DCE</SheetTitle><SheetDescription>Le passage cité est surligné dans la pièce.</SheetDescription></SheetHeader></SheetContent>
          </Sheet>
        </div>
      </Section>

      <Section id="mouvement" titre="Mouvement" note="Transform et opacité seulement. Sous « réduire les animations », tout est instantané.">
        <Cote><Mouvement /></Cote>
      </Section>

      <Section id="icones" titre="Icônes" note="lucide-react, trait de 1,5 px constant, 20 px, extrémités arrondies.">
        <Cote>
          <div className="flex flex-wrap gap-4 text-fg-2">
            {[Search, FolderOpen, Briefcase, Building2, Archive, Users, Settings, Bell, FileText, Plus].map((Icone, i) => (
              <Icone key={i} size={20} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
            ))}
          </div>
        </Cote>
      </Section>
    </div>
  )
}
