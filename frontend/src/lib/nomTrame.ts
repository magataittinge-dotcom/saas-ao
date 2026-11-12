// Le nom de la trame DPGF/BPU/DQE téléchargée depuis « Réunir les pièces » : le nom de la pièce, puis l'extension du fichier
// réel (un PDF de l'acheteur reste un .pdf). L'extension vient du nom envoyé par le serveur (Content-Disposition, lisible en
// production où l'API est sur la même origine), sinon du type du fichier (Content-Type, toujours lisible). Type inconnu :
// aucune extension inventée.

// Un nom de fichier, pas un texte d'écran : « DPGF », « BPU », « DQE » viennent du type de la pièce (dpgf_template…).
const TRAMES = new Set(['dpgf_template', 'bpu_template', 'dqe_template'])

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'xlsm',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.oasis.opendocument.text': 'odt',
  'text/csv': 'csv',
  'application/zip': 'zip',
}

function nomEnvoye(entete: string | undefined): string | null {
  const utf8 = entete?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (utf8) { try { return decodeURIComponent(utf8) } catch { /* repli ci-dessous */ } }
  return entete?.match(/filename="?([^";]+)"?/i)?.[1] ?? null
}

function extensionDe(nom: string | null): string | null {
  return nom?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() ?? null
}

export function nomTrame(typePiece: string, reponse: { entete?: string; mime?: string }): string {
  const base = TRAMES.has(typePiece) ? typePiece.replace(/_template$/, '').toUpperCase() : 'bordereau'
  const mime = (reponse.mime ?? '').split(';')[0].trim().toLowerCase()
  const extension = extensionDe(nomEnvoye(reponse.entete)) ?? EXTENSIONS[mime] ?? null
  return extension ? `${base}.${extension}` : base
}
