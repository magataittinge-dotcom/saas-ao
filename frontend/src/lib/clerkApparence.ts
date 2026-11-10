// Clerk habillé avec les jetons du système (prop `appearance` du ClerkProvider) : mêmes couleurs, mêmes
// rayons, mêmes polices que le reste de l'application, en clair comme en nuit.
// Clerk calcule ses nuances à partir de vraies couleurs : les `variables` reçoivent donc les valeurs
// RÉSOLUES des jetons (lues sur <html>, qui porte data-theme) ; les `elements` utilisent var(--jeton).
import type { ComponentProps } from 'react'
import type { ClerkProvider } from '@clerk/clerk-react'

export type ApparenceClerk = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>
export type LocalisationClerk = NonNullable<ComponentProps<typeof ClerkProvider>['localization']>

/** `lire('--text-1')` renvoie la valeur résolue du jeton dans le thème affiché. */
export function construireApparence(lire: (jeton: string) => string): ApparenceClerk {
  return {
    variables: {
      colorPrimary: lire('--accent-fill-solid'),
      colorTextOnPrimaryBackground: lire('--on-accent'),
      colorBackground: lire('--surface-pop'),
      colorText: lire('--text-1'),
      colorTextSecondary: lire('--text-2'),
      colorInputBackground: lire('--surface-0'),
      colorInputText: lire('--text-1'),
      colorNeutral: lire('--text-1'),
      colorDanger: lire('--danger-fg'),
      colorSuccess: lire('--success-fg'),
      colorWarning: lire('--warning-fg'),
      fontFamily: lire('--font-ui'),
      fontFamilyButtons: lire('--font-ui'),
      borderRadius: lire('--radius-md'),
    },
    // Les éléments suivent le système, par les classes aux jetons (jamais une valeur écrite ici) : carte (rayon 22, trait,
    // ombre), titre en serif (c'est le h1 de l'écran), champs et boutons à 44 px, bouton principal = celui du système
    // (pilule, dégradé d'accent), casse de phrase. « ! » : les styles que Clerk injecte passent après la feuille de l'appli.
    elements: {
      rootBox: '!w-full !max-w-[400px]',
      cardBox: '!w-full !max-w-[400px] !rounded-carte !shadow-pop',
      card: '!rounded-carte !border !border-solid !border-bord-2 !shadow-none',
      headerTitle: '!font-display !text-xl !font-medium !tracking-[-0.01em]',
      headerSubtitle: '!text-sm',
      formButtonPrimary: `!min-h-11 !rounded-pilule ![background-image:var(--accent-fill)] !text-sm !font-semibold !normal-case !shadow-cta`,
      formFieldInput: '!min-h-11 !rounded-lg !border !border-solid !border-bord-champ !text-sm focus:!border-accent-ring',
      formFieldLabel: '!text-xs !font-medium',
      socialButtonsBlockButton: '!min-h-11 !rounded-lg !border !border-solid !border-bord-champ',
      footerActionLink: '!font-medium !text-accent-text',
      formFieldAction: '!text-accent-text',
      identityPreviewEditButton: '!text-accent-text',
      userButtonPopoverCard: '!border !border-solid !border-bord-2 !shadow-pop',
    },
  }
}

/** Valeurs résolues lues sur <html> (navigateur). */
export function apparenceDepuisPage(): ApparenceClerk {
  const styles = getComputedStyle(document.documentElement)
  return construireApparence((jeton) => styles.getPropertyValue(jeton).trim())
}

/** L'écran de connexion et d'inscription en français (prop `localization` du ClerkProvider).
 *  Objet maison, sans dépendance de plus : seules les clés des écrans utilisés (connexion, inscription,
 *  code reçu par e-mail, mot de passe oublié, menu du compte) sont traduites ; Clerk garde son anglais
 *  pour le reste, qui n'est pas affiché. Ton sobre, vouvoiement. */
export const localisationFr: LocalisationClerk = {
  locale: 'fr-FR',
  socialButtonsBlockButton: 'Continuer avec {{provider|titleize}}',
  socialButtonsBlockButtonManyInView: '{{provider|titleize}}',
  dividerText: 'ou',
  formFieldLabel__emailAddress: 'Adresse e-mail',
  formFieldLabel__emailAddresses: 'Adresses e-mail',
  formFieldLabel__phoneNumber: 'Numéro de téléphone',
  formFieldLabel__username: 'Nom d’utilisateur',
  formFieldLabel__emailAddress_username: 'Adresse e-mail ou nom d’utilisateur',
  formFieldLabel__password: 'Mot de passe',
  formFieldLabel__currentPassword: 'Mot de passe actuel',
  formFieldLabel__newPassword: 'Nouveau mot de passe',
  formFieldLabel__confirmPassword: 'Confirmer le mot de passe',
  formFieldLabel__firstName: 'Prénom',
  formFieldLabel__lastName: 'Nom',
  formFieldInputPlaceholder__emailAddress: 'Votre adresse e-mail',
  formFieldInputPlaceholder__password: 'Votre mot de passe',
  formFieldInputPlaceholder__firstName: 'Votre prénom',
  formFieldInputPlaceholder__lastName: 'Votre nom',
  formFieldAction__forgotPassword: 'Mot de passe oublié ?',
  formFieldHintText__optional: 'Facultatif',
  formFieldError__notMatchingPasswords: 'Les mots de passe ne correspondent pas.',
  formFieldError__matchingPasswords: 'Les mots de passe correspondent.',
  formButtonPrimary: 'Continuer',
  formButtonPrimary__verify: 'Vérifier',
  backButton: 'Retour',
  footerActionLink__useAnotherMethod: 'Utiliser une autre méthode',
  footerPageLink__help: 'Aide',
  footerPageLink__privacy: 'Confidentialité',
  footerPageLink__terms: 'Conditions',
  signIn: {
    start: {
      title: 'Se connecter à Synorix',
      subtitle: 'Retrouvez vos appels d’offres.',
      actionText: 'Pas encore de compte ?',
      actionLink: 'Créer un compte',
    },
    password: { title: 'Votre mot de passe', subtitle: 'Saisissez-le pour continuer.', actionLink: 'Mot de passe oublié ?' },
    forgotPassword: {
      title: 'Mot de passe oublié',
      subtitle: 'Nous vous envoyons un code pour le réinitialiser.',
      formTitle: 'Code de réinitialisation',
      resendButton: 'Renvoyer le code',
    },
    resetPassword: { title: 'Nouveau mot de passe', formButtonPrimary: 'Enregistrer le mot de passe' },
    emailCode: {
      title: 'Consultez votre messagerie',
      subtitle: 'Saisissez le code reçu par e-mail.',
      formTitle: 'Code de vérification',
      resendButton: 'Renvoyer le code',
    },
    emailLink: { title: 'Consultez votre messagerie', subtitle: 'Cliquez sur le lien reçu par e-mail.' },
    alternativeMethods: { title: 'Autres méthodes de connexion', actionLink: 'Aide', blockButton__password: 'Se connecter avec votre mot de passe' },
  },
  signUp: {
    start: {
      title: 'Créer votre compte Synorix',
      subtitle: 'Votre premier appel d’offres est offert.',
      actionText: 'Déjà un compte ?',
      actionLink: 'Se connecter',
    },
    emailCode: {
      title: 'Vérifiez votre adresse e-mail',
      subtitle: 'Saisissez le code reçu par e-mail.',
      formTitle: 'Code de vérification',
      formSubtitle: 'Le code a été envoyé à votre adresse e-mail.',
      resendButton: 'Renvoyer le code',
    },
    continue: { title: 'Compléter votre compte', subtitle: 'Il reste quelques informations.', actionText: 'Déjà un compte ?', actionLink: 'Se connecter' },
  },
  userButton: {
    action__manageAccount: 'Gérer le compte',
    action__signOut: 'Se déconnecter',
    action__signOutAll: 'Se déconnecter de tous les comptes',
    action__addAccount: 'Ajouter un compte',
  },
  unstable__errors: {
    form_identifier_not_found: 'Aucun compte ne correspond à cette adresse.',
    form_password_incorrect: 'Mot de passe incorrect.',
    form_code_incorrect: 'Code incorrect.',
    form_param_nil: 'Ce champ est obligatoire.',
    form_identifier_exists__email_address: 'Cette adresse e-mail est déjà utilisée.',
    form_param_format_invalid: 'Vérifiez ce champ : la saisie n’est pas valide.',
    form_param_format_invalid__email_address: 'Saisissez une adresse e-mail valide.',
    form_password_or_identifier_incorrect: 'Adresse e-mail ou mot de passe incorrect.',
    form_password_length_too_short: 'Ce mot de passe est trop court.',
    form_password_not_strong_enough: 'Ce mot de passe est trop simple.',
    form_password_pwned: 'Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.',
  },
}
