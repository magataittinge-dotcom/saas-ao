// Limite d'un dépôt : celle du serveur (backend/services/upload_validation.py, VAULT_MAX_UPLOAD_SIZE).
// Formats que le coffre-fort accepte : les mêmes que les dépôts de « Mon entreprise » (backend/services/depot_cases.py
// et upload_validation.VAULT_ALLOWED_EXTENSIONS). Le serveur reste juge du contenu réel ; ceci filtre le sélecteur.
export const TAILLE_MAX_COFFRE_MO = 50

export const FORMATS_COFFRE = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
} as const

export const PRECISION_COFFRE = `PDF, Word, Excel, JPEG ou PNG, ${TAILLE_MAX_COFFRE_MO} Mo au plus par fichier`

export const MESSAGE_REFUS_FORMAT = `PDF, Word, Excel, JPEG ou PNG de ${TAILLE_MAX_COFFRE_MO} Mo au plus`
