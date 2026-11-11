// FIN-D — second tour du jury, lot d : connexion et inscription, pages juridiques, site public, écrans d'état.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verificationAffichee } from '@/components/public/EcranCompte'
import { construireApparence, localisationFr } from '@/lib/clerkApparence'
import { lire, sansCommentaires } from './outils/sources'

const NB = '\u00a0'
const nb = (html: string, motif: RegExp) => (html.match(motif) ?? []).length

// ─── Connexion, inscription ───
test('compte : le titre est à la page (un h1 serif, hors de la carte du fournisseur), Synorix parle une fois', () => {
  const src = sansCommentaires(lire('src/components/public/EcranCompte.tsx'))
  assert.equal(nb(src, /<h1/g), 1)
  assert.match(src, /<h1 className="titre-page text-fg">\{titre\}<\/h1>/)
  assert.equal(nb(src, /<SynorixParle/g), 1)
  assert.match(src, /<CoquillePublique>/, 'la coquille du site reste autour de la carte')
  assert.match(sansCommentaires(lire('src/routes/Login.tsx')), /titre="Se connecter à Synorix" sousTitre="Retrouvez vos appels d’offres\."/)
  assert.match(sansCommentaires(lire('src/routes/Register.tsx')), /titre="Créer votre compte Synorix" sousTitre="Votre premier appel d’offres est offert\."/)
})

test('inscription : pendant la vérification anti-robot, la page dit ce qui se passe ; au repos, rien', () => {
  assert.equal(verificationAffichee(null), false)
  assert.equal(verificationAffichee({ childElementCount: 0, style: { maxHeight: '0px' } }), false, 'zone repliée : la vérification se fait seule')
  assert.equal(verificationAffichee({ childElementCount: 1, style: { maxHeight: '0px' } }), false)
  assert.equal(verificationAffichee({ childElementCount: 1, style: { maxHeight: 'unset' } }), true, 'case à cocher affichée')
  const src = lire('src/components/public/EcranCompte.tsx')
  assert.ok(src.includes(`Cochez la case «${NB}Vérifiez que vous êtes humain${NB}». Votre inscription reprend ensuite, sans rien ressaisir.`))
  const inscription = sansCommentaires(lire('src/routes/Register.tsx'))
  assert.match(inscription, /<VerificationHumaine \/>/)
  assert.match(inscription, /to="\/legal\/cgu"/, 'les conditions acceptées sont dites près du bouton')
  assert.match(inscription, /to="\/legal\/politique-confidentialite"/)
})

test('Clerk : une seule surface, plus de flèche ni de disque du fournisseur, exemple de saisie à l’encre 3, erreur au trait rouge', () => {
  const e = construireApparence(() => '#000000').elements as Record<string, string>
  assert.match(e.cardBox, /!shadow-none/, 'plus d’ombre large')
  assert.match(e.cardBox, /!border-bord-2/)
  assert.match(e.card, /!border-0/, 'pas de carte dans une carte')
  assert.match(e.footer, /background:none/, 'plus de pied gris sous la carte')
  assert.match(e.header, /\.cl-signIn-start_&\]:!hidden/, 'le titre du premier écran est celui de la page')
  assert.match(e.header, /\.cl-signUp-start_&\]:!hidden/)
  assert.equal(e.buttonArrowIcon, '!hidden')
  assert.match(e.socialButtonsBlockButtonText, /!text-sm.*!text-fg\b/, '« Continuer avec Google » n’a plus l’air éteint')
  assert.match(e.formFieldInput, /placeholder:!text-fg-3/)
  assert.match(e.formFieldInput, /aria-\[invalid=true\]:!border-rouge-mark/)
  assert.match(e.formFieldErrorText, /\[&>svg\]:!hidden/)
  assert.match(e.formFieldInputShowPasswordButton, /!min-h-11 !min-w-11/, 'cible de 44 px')
  const l = localisationFr as Record<string, any>
  assert.equal(l.formFieldInputPlaceholder__emailAddress, 'prenom@entreprise.fr', 'un exemple, pas l’écho de l’étiquette')
  for (const cle of ['formFieldInputPlaceholder__password', 'formFieldInputPlaceholder__firstName', 'formFieldInputPlaceholder__lastName']) assert.equal(l[cle], '', cle)
  // une adresse sans compte : la cause et la correction (jury, tour 1 : « Vérifiez ce champ : la saisie n'est pas valide. »)
  for (const code of ['form_identifier_not_found', 'form_param_format_invalid']) {
    assert.match(l.unstable__errors[code], /Vérifiez-la, ou créez votre compte\.$/, code)
    assert.doesNotMatch(l.unstable__errors[code], /pas valide|invalide/, code)
  }
})

test('Clerk : aucun réglage du produit n’affiche « Development mode » ; la clé publiable vient de l’environnement', () => {
  const main = sansCommentaires(lire('src/main.tsx'))
  assert.match(main, /import\.meta\.env\.VITE_CLERK_PUBLISHABLE_KEY/)
  assert.doesNotMatch(main, /pk_test_|pk_live_/, 'aucune clé écrite dans le code')
  const apparence = sansCommentaires(lire('src/lib/clerkApparence.ts'))
  assert.doesNotMatch(apparence, /pk_test_|unsafe_disableDevelopmentModeWarnings|footerPages|logoBox.*hidden/, 'on ne masque pas la mention du fournisseur : elle disparaît avec la clé de production')
})
