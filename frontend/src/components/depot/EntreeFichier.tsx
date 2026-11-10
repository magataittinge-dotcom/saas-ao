import { createElement, forwardRef, type InputHTMLAttributes } from 'react'

/**
 * Le sélecteur de fichier du navigateur, caché : il n'a aucune apparence, c'est un `Bouton` du système (ou une zone de dépôt)
 * qui l'ouvre. Le système n'a pas (encore) de champ « fichier » : toutes les entrées de fichier du lot passent par ici, pour
 * qu'il n'y ait qu'un seul endroit à remplacer le jour où le socle en fournit un.
 */
export const EntreeFichier = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>((props, ref) =>
  createElement('input', { tabIndex: -1, 'aria-hidden': true, ...props, type: 'file', ref, hidden: true }))
EntreeFichier.displayName = 'EntreeFichier'

export default EntreeFichier
