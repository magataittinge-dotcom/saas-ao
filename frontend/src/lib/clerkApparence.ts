// Clerk habillé avec les jetons du système (prop `appearance` du ClerkProvider) : mêmes couleurs, mêmes
// rayons, mêmes polices que le reste de l'application, en clair comme en nuit.
// Clerk calcule ses nuances à partir de vraies couleurs : les `variables` reçoivent donc les valeurs
// RÉSOLUES des jetons (lues sur <html>, qui porte data-theme) ; les `elements` utilisent var(--jeton).
import type { ComponentProps } from 'react'
import type { ClerkProvider } from '@clerk/clerk-react'

export type ApparenceClerk = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>

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
    elements: {
      card: { border: '1px solid var(--border-2)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-pop)' },
      headerTitle: { fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.01em' },
      formButtonPrimary: { backgroundImage: 'var(--accent-fill)', boxShadow: 'var(--shadow-btn)', fontWeight: 600, textTransform: 'none' },
      formFieldInput: { border: '1px solid var(--border-field)', '&:focus': { borderColor: 'var(--accent-ring)', boxShadow: '0 0 0 2px var(--accent-ring)' } },
      socialButtonsBlockButton: { border: '1px solid var(--border-field)' },
      footerActionLink: { color: 'var(--accent-text)', fontWeight: 500 },
      formFieldAction: { color: 'var(--accent-text)' },
      identityPreviewEditButton: { color: 'var(--accent-text)' },
      userButtonPopoverCard: { border: '1px solid var(--border-2)', boxShadow: 'var(--shadow-pop)' },
    },
  }
}

/** Valeurs résolues lues sur <html> (navigateur). */
export function apparenceDepuisPage(): ApparenceClerk {
  const styles = getComputedStyle(document.documentElement)
  return construireApparence((jeton) => styles.getPropertyValue(jeton).trim())
}
