// Équipe et Mes références sont des accès de « Mon entreprise » : leurs adresses ne changent pas et mènent à la rubrique
// correspondante (Moyens humains et matériels ; Certifications et références). Lu par App.tsx et par navigation.ts.
// Module sans dépendance : l'accueil public ne télécharge pas la coquille pour le lire.
export const REDIRECTIONS_ENTREPRISE: Readonly<Record<string, string>> = {
  '/team': '/company?rubrique=moyens',
  '/references': '/company?rubrique=certifications',
}
