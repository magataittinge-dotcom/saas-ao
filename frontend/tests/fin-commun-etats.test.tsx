// Jury, tour 1 (11/11/2026) — une seule famille d'états : un modèle d'erreur, un modèle de vide, une bande qui se resserre.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { EtatErreur, EtatVide } from '@/components/ui/etats'
import { SynorixParle } from '@/components/ui/synorix-parle'
import { BandeResume, type CarteResume } from '@/components/etape'
import { lire, sansCommentaires } from './outils/sources'

test('état d\'erreur : une icône à la couleur de l\'état, un titre, une phrase, « Réessayer » ; aligné à gauche, jamais centré', () => {
  const html = renderToStaticMarkup(<EtatErreur titre="Vos appels d’offres n’ont pas pu se charger" onReessayer={() => {}} />)
  assert.match(html, /role="alert"/)
  assert.match(html, /<svg[^>]*text-rouge-ink/)
  assert.match(html, /data-reessayer=""[^>]*>Réessayer</)
  assert.doesNotMatch(html, /text-center|mx-auto|py-10|flex justify-center/)
  assert.match(html, /max-w-\[60ch\]/)
})

test('état vide : aligné à gauche comme la page, plus « centré dans une carte de 1 200 px »', () => {
  const html = renderToStaticMarkup(<EtatVide titre="Votre premier dossier se prépare ici" phrase="Déposez le dossier de l’acheteur." action={<button type="button">Déposer</button>} />)
  assert.doesNotMatch(html, /text-center|mx-auto|py-10|flex justify-center/)
  assert.match(html, /max-w-\[60ch\]/)
})

test('un seul « Réessayer » par écran : le premier état d\'erreur porte le bouton et relance tous les autres', () => {
  const code = sansCommentaires(lire('src/components/ui/etats.tsx'))
  assert.match(code, /const bouton = onReessayer && meneur/)
  assert.match(code, /erreursMontees\.slice\(\)\.forEach\(\(e\) => e\.relancer\(\)\)/)
  assert.match(code, /meneur: premiere === null \|\| premiere === id/)
  // « Réessayer » est le geste de l'écran : la barre du haut passe au trait
  assert.match(code, /declarer\(1\)/)
})

test('« Synorix parle » : un visage de 56 px, qu\'on reconnaît (32 px : une tache)', () => {
  const html = renderToStaticMarkup(<SynorixParle>Le dossier n’a pas encore été analysé.</SynorixParle>)
  assert.match(html, /data-visage=""[^>]*size-14/)
  assert.doesNotMatch(html, /size-8/)
})

const cartes = (n: CarteResume[]) => renderToStaticMarkup(<BandeResume cartes={n} />)

test('bande de résumé : une case sans rien à compter ne porte pas de pastille', () => {
  const html = cartes([{ libelle: 'À joindre', valeur: '14', etat: 'a-verifier' }, { libelle: 'À renouveler', valeur: 'Aucune', rien: 'Aucune', etat: 'pret' }])
  assert.match(html, /À vérifier/)
  assert.doesNotMatch(html, /Prêt/, '« Aucune » + « Prêt » : une incertitude affichée comme une certitude')
  assert.equal((html.match(/data-case-resume/g) ?? []).length, 2, 'une seule case sans valeur : elle reste')
})

test('bande de résumé : à partir de deux cases sans rien à compter, la bande se resserre en une ligne de faits', () => {
  const html = cartes([
    { libelle: 'À joindre', valeur: '14' },
    { libelle: 'À renouveler', valeur: 'Aucune', rien: 'Aucune', etat: 'pret' },
    { libelle: 'À confirmer', valeur: '0', rien: 'Aucune' },
    { libelle: 'Lots', valeur: 'Aucun' },
  ])
  assert.equal((html.match(/data-case-resume/g) ?? []).length, 1)
  assert.match(html, /data-cases-sans-rien=""[^>]*>À renouveler : aucune · À confirmer : aucune · Lots : aucun</)
  assert.doesNotMatch(html, /Prêt/)
  // tout est vide : plus de surface du tout, la seule ligne de faits
  const rien = cartes([{ libelle: 'À joindre', valeur: 'Aucune', rien: 'Aucune' }, { libelle: 'Lots', valeur: '' }])
  assert.doesNotMatch(rien, /data-bande-cases|data-case-resume/)
  assert.match(rien, /data-cases-sans-rien/)
  // une jauge, une désignation ou une source : la case a quelque chose à montrer, elle reste
  const jauge = cartes([{ libelle: 'Prêtes', valeur: 'Aucune', rien: 'Aucune', jauge: { rempli: 0, total: 14 } }, { libelle: 'Lots', valeur: '' }])
  assert.equal((jauge.match(/data-case-resume/g) ?? []).length, 2)
})

// ── Squelettes : à la forme du contenu, sans valeur par défaut ──
import { SqueletteEtape, SqueletteFil } from '@/components/etape'

test('squelette d\'une étape : la forme du gabarit (titre et action, bande d\'une surface à quatre cases, lignes de phrase), aucune valeur écrite, rien ne boucle', () => {
  const html = renderToStaticMarkup(<SqueletteEtape />)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /md:grid-cols-4/)
  assert.match(html, /max-md:grid-cols-2/, 'deux par deux au téléphone, comme la vraie bande')
  assert.equal((html.match(/min-h-\[150px\]/g) ?? []).length, 4)
  assert.doesNotMatch(html, /animate-|pulse|shimmer/)
  assert.doesNotMatch(html, /(?<!max-)w-full/, 'aucune barre de 1 200 px')
  assert.equal(html.replace(/<[^>]+>/g, '').trim(), '', 'aucun texte : ni « 0 », ni « Prêt », ni « Aucun »')
})

test('squelette du fil des étapes : sept ronds sur toute la largeur ; le pied de page attend le contenu', () => {
  const html = renderToStaticMarkup(<SqueletteFil />)
  assert.match(html, /justify-between/)
  assert.equal((html.match(/rounded-pilule/g) ?? []).length, 7)
  assert.match(lire('src/index.css'), /main:has\(\[data-phase="chargement"\], \[data-squelette-ao\], \[data-squelette-etape\]\) > \[data-coquille="pied"\] \{ visibility: hidden; \}/)
})

// ── La bande de cases du système se resserre (Mes AO, Accueil, Outils, étapes) ──
import { BandeCases, CaseResume } from '@/components/ui/case-resume'

test('bande de cases : deux cases sans rien à compter quittent la surface pour une ligne de faits ; une seule reste une case', () => {
  const deux = renderToStaticMarkup(
    <BandeCases libelle="Résumé de mes appels d’offres">
      <CaseResume etiquette="En cours" valeur={3} />
      <CaseResume etiquette="Remise sous 7 jours" valeur={0} rien="Aucune" />
      <CaseResume etiquette="À mettre à jour" valeur={0} />
      <CaseResume etiquette="Unités du mois" valeur={0} rien="Aucune" action={<a href="/settings/billing">Voir l’abonnement</a>} />
    </BandeCases>)
  assert.equal((deux.match(/data-case-resume/g) ?? []).length, 2, 'la case qui compte et celle qui porte un lien')
  assert.match(deux, /md:grid-cols-2/)
  assert.match(deux, /data-cases-sans-rien=""[^>]*>Remise sous 7 jours : aucune · À mettre à jour : aucun</)
  assert.equal((deux.match(/data-surface/g) ?? []).length, 1)
  const une = renderToStaticMarkup(<BandeCases><CaseResume etiquette="En cours" valeur={3} /><CaseResume etiquette="À mettre à jour" valeur={0} /></BandeCases>)
  assert.equal((une.match(/data-case-resume/g) ?? []).length, 2)
  assert.doesNotMatch(une, /data-cases-sans-rien/)
})

test('toast : l\'état se lit au trait (rouge pour un échec), pas seulement à l\'icône', () => {
  assert.match(sansCommentaires(lire('src/components/ui/toast.tsx')), /toast\.ton === 'erreur' \? 'border-rouge-mark'/)
})
