// Précompression au build : à côté de chaque .js, .mjs, .css, .svg, .html et .json de dist/, un
// fichier .gz (gzip niveau 9) et un .br (brotli qualité 11), pour que nginx les serve tels quels
// (`gzip_static on;` / `brotli_static on;`) sans recompresser à chaque requête.
// Aucune dépendance : zlib de Node. N'écrit que sous le dossier donné (défaut : dist/).
// Un fichier dont la version compressée n'est pas plus petite n'en a pas : nginx sert l'original.
//
//   node scripts/precompresser.mjs [dossier]
import { readdirSync, readFileSync, statSync, writeFileSync, utimesSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const EXTENSIONS = new Set(['.js', '.mjs', '.css', '.svg', '.html', '.json'])

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    const chemin = path.join(dossier, nom)
    const etat = statSync(chemin)
    if (etat.isDirectory()) yield* fichiers(chemin)
    else if (EXTENSIONS.has(path.extname(nom))) yield [chemin, etat]
  }
}

export function precompresser(dossier) {
  let n = 0, brut = 0, gz = 0, br = 0
  for (const [chemin, etat] of fichiers(dossier)) {
    const source = readFileSync(chemin)
    const versions = [
      ['.gz', zlib.gzipSync(source, { level: 9 })],
      ['.br', zlib.brotliCompressSync(source, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length },
      })],
    ]
    let ecrit = false
    for (const [ext, octets] of versions) {
      if (octets.length >= source.length) continue
      writeFileSync(chemin + ext, octets)
      utimesSync(chemin + ext, etat.atime, etat.mtime)   // même date que la source
      if (ext === '.gz') gz += octets.length; else br += octets.length
      ecrit = true
    }
    if (ecrit) { n++; brut += source.length }
  }
  return { fichiers: n, brut, gz, br }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dossier = path.resolve(process.argv[2] ?? 'dist')
  const r = precompresser(dossier)
  const ko = (v) => (v / 1000).toFixed(1)
  console.log(`précompression de ${dossier} : ${r.fichiers} fichiers, ${ko(r.brut)} kB -> gzip ${ko(r.gz)} kB, brotli ${ko(r.br)} kB`)
}
