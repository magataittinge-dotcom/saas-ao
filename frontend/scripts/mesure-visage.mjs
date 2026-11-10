// Mesure des couleurs du visage de Synorix, en OKLCH. Rejouable, sans dépendance : Node et ffmpeg (présent sur le poste).
//
//   node scripts/mesure-visage.mjs [dossier de sortie]
//     → scripts/visage-mesure.json (toujours : c'est la référence lue par les tests et par palette-visage.mjs)
//     → <dossier>/MESURE.md, <dossier>/visage-mesure.json, <dossier>/visage-teintes.svg (si un dossier est donné)
//
// Méthode
//   1. Images : ffmpeg tire 3 images par seconde de chaque clip (≥ 15 images pour 5 s), ramenées à 160 px de large ; les
//      affiches (.webp) comptent pour une image chacune.
//   2. Sujet / fond : le fond est la médiane OKLab de la couronne extérieure de l'image (6 % de chaque bord). Un pixel est
//      « allumé » s'il s'écarte du fond de plus de 0,08 ΔE OK (4 fois le seuil de perception). Le sujet est l'ENVELOPPE des
//      pixels allumés, ligne par ligne (du premier au dernier pixel allumé de la ligne) : les ombres intérieures du visage,
//      presque aussi sombres que le fond, restent ainsi dans le sujet.
//   3. Teintes dominantes : k-moyennes (k = 6) dans OKLab sur les pixels du sujet, départ déterministe (points les plus
//      éloignés), pondérées par la surface (un pixel = une voix).
//   4. Ombres = moyenne OKLab des 10 % de pixels du sujet les plus sombres ; lumières = les 10 % les plus clairs.
//   5. Familles de teinte : histogramme des teintes des pixels colorés (C ≥ 0,03), par pas de 10°, pondéré par la chroma ;
//      chaque pic donne une famille (teinte moyenne circulaire, L et C moyens, C au 95e centile, part de la surface du sujet).
//   6. Chroma maximale réellement présente : 99,9e centile (le maximum brut d'un pixel isolé est du bruit de compression).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lineaireVersOklab, oklabVersOklch, oklchVersHex, versLineaire, deltaE } from './couleur.mjs'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.resolve(ICI, '..', 'public')
const LARGEUR = 160
const SEUIL_SUJET = 0.08
const K = 6

const LIN = Array.from({ length: 256 }, (_, v) => versLineaire(v / 255))
const arr = (x, n = 3) => Number(x.toFixed(n))

function ffmpeg(args, entree) {
  return execFileSync('ffmpeg', ['-v', 'error', ...args], { maxBuffer: 1 << 30, input: entree })
}
function taille(fichier) {
  const s = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fichier]).toString().trim()
  const [w, h] = s.split(',').map(Number)
  return [w, h]
}

/** Images d'une source, en RGB brut ramené à LARGEUR. */
function images(fichier) {
  const [w, h] = taille(fichier)
  const H = Math.round((h * LARGEUR) / w / 2) * 2
  const video = /\.(webm|mp4)$/.test(fichier)
  const filtre = (video ? 'fps=3,' : '') + `scale=${LARGEUR}:${H}:flags=area`
  const brut = ffmpeg(['-i', fichier, '-vf', filtre, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  const n = Math.floor(brut.length / (LARGEUR * H * 3))
  return { brut, n, W: LARGEUR, H }
}

/** OKLab de chaque pixel d'une image + masque du sujet. */
function analyserImage(brut, debut, W, H) {
  const lab = new Float32Array(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    const o = lineaireVersOklab([LIN[brut[debut + i * 3]], LIN[brut[debut + i * 3 + 1]], LIN[brut[debut + i * 3 + 2]]])
    lab[i * 3] = o[0]; lab[i * 3 + 1] = o[1]; lab[i * 3 + 2] = o[2]
  }
  // fond : médiane de la couronne extérieure
  const bx = Math.max(2, Math.round(W * 0.06))
  const by = Math.max(2, Math.round(H * 0.06))
  const cour = [[], [], []]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < bx || x >= W - bx || y < by || y >= H - by) for (let c = 0; c < 3; c++) cour[c].push(lab[(y * W + x) * 3 + c])
  }
  const med = (t) => { t.sort((a, b) => a - b); return t[t.length >> 1] }
  const fond = cour.map(med)
  const sujet = new Uint8Array(W * H)
  let surface = 0
  for (let y = 0; y < H; y++) {
    let g = -1
    let d = -1
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      if (deltaE([lab[i], lab[i + 1], lab[i + 2]], fond) > SEUIL_SUJET) { if (g < 0) g = x; d = x }
    }
    if (g >= 0) for (let x = g; x <= d; x++) { sujet[y * W + x] = 1; surface++ }
  }
  return { lab, sujet, fond, part: surface / (W * H) }
}

/** k-moyennes déterministes dans OKLab. pts : Float32Array [L,a,b,…]. */
function kmoyennes(pts, k) {
  const n = pts.length / 3
  const pas = Math.max(1, Math.floor(n / 20000))
  const centres = [[0, 0, 0]]
  for (let i = 0; i < n; i += pas) for (let c = 0; c < 3; c++) centres[0][c] += pts[i * 3 + c]
  const ne = Math.ceil(n / pas)
  centres[0] = centres[0].map((v) => v / ne)
  while (centres.length < k) {
    let meilleur = 0
    let dmax = -1
    for (let i = 0; i < n; i += pas) {
      let dmin = Infinity
      for (const c of centres) dmin = Math.min(dmin, Math.hypot(pts[i * 3] - c[0], pts[i * 3 + 1] - c[1], pts[i * 3 + 2] - c[2]))
      if (dmin > dmax) { dmax = dmin; meilleur = i }
    }
    centres.push([pts[meilleur * 3], pts[meilleur * 3 + 1], pts[meilleur * 3 + 2]])
  }
  let compte = new Array(k).fill(0)
  for (let tour = 0; tour < 25; tour++) {
    const somme = centres.map(() => [0, 0, 0])
    compte = new Array(k).fill(0)
    for (let i = 0; i < n; i++) {
      let j = 0
      let dmin = Infinity
      for (let c = 0; c < k; c++) {
        const d = (pts[i * 3] - centres[c][0]) ** 2 + (pts[i * 3 + 1] - centres[c][1]) ** 2 + (pts[i * 3 + 2] - centres[c][2]) ** 2
        if (d < dmin) { dmin = d; j = c }
      }
      compte[j]++
      somme[j][0] += pts[i * 3]; somme[j][1] += pts[i * 3 + 1]; somme[j][2] += pts[i * 3 + 2]
    }
    for (let c = 0; c < k; c++) if (compte[c]) centres[c] = somme[c].map((v) => v / compte[c])
  }
  return centres.map((c, i) => ({ lab: c, part: compte[i] / n })).filter((c) => c.part > 0).sort((a, b) => b.part - a.part)
}

const fiche = (lab, extra = {}) => {
  const [L, C, h] = oklabVersOklch(lab)
  return { L: arr(L), C: arr(C), h: arr(h, 1), hex: oklchVersHex([L, C, h]), ...extra }
}

/** Statistiques d'un nuage de pixels du sujet. */
function statistiques(pts) {
  const n = pts.length / 3
  const Ls = new Float32Array(n)
  const Cs = new Float32Array(n)
  for (let i = 0; i < n; i++) { Ls[i] = pts[i * 3]; Cs[i] = Math.hypot(pts[i * 3 + 1], pts[i * 3 + 2]) }
  const tri = Float32Array.from(Ls).sort()
  const bas = tri[Math.floor(n * 0.1)]
  const haut = tri[Math.floor(n * 0.9)]
  const moy = (garde) => {
    const s = [0, 0, 0]
    let c = 0
    for (let i = 0; i < n; i++) if (garde(i)) { s[0] += pts[i * 3]; s[1] += pts[i * 3 + 1]; s[2] += pts[i * 3 + 2]; c++ }
    return s.map((v) => v / Math.max(1, c))
  }
  const triC = Float32Array.from(Cs).sort()
  // familles de teinte : histogramme 10°, pondéré par la chroma, pixels colorés seulement
  const histo = new Float64Array(36)
  let colores = 0
  for (let i = 0; i < n; i++) if (Cs[i] >= 0.03) {
    const h = ((Math.atan2(pts[i * 3 + 2], pts[i * 3 + 1]) * 180) / Math.PI + 360) % 360
    histo[Math.floor(h / 10) % 36] += Cs[i]
    colores++
  }
  const total = histo.reduce((a, b) => a + b, 0) || 1
  const familles = []
  // pics de l'histogramme, du plus lourd au plus léger ; deux pics à moins de 30° forment une seule famille
  const pics = []
  for (let b = 0; b < 36; b++) if (histo[b] / total >= 0.01 && histo[b] >= histo[(b + 35) % 36] && histo[b] > histo[(b + 1) % 36]) pics.push(b)
  pics.sort((p, q) => histo[q] - histo[p])
  const gardes = []
  for (const b of pics) if (gardes.every((g) => Math.min(Math.abs(g - b), 36 - Math.abs(g - b)) >= 3)) gardes.push(b)
  for (const b of gardes) {
    const v = histo[b]
    const centre = b * 10 + 5
    let sx = 0, sy = 0, sL = 0, sC = 0, c = 0
    const cs = []
    for (let i = 0; i < n; i++) if (Cs[i] >= 0.03) {
      const h = ((Math.atan2(pts[i * 3 + 2], pts[i * 3 + 1]) * 180) / Math.PI + 360) % 360
      if (Math.abs(((h - centre + 540) % 360) - 180) <= 25) { sx += pts[i * 3 + 1]; sy += pts[i * 3 + 2]; sL += Ls[i]; sC += Cs[i]; cs.push(Cs[i]); c++ }
    }
    cs.sort((p, q) => p - q)
    familles.push({
      h: arr(((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360, 1), L: arr(sL / c), C: arr(sC / c),
      C95: arr(cs[Math.floor(cs.length * 0.95)]), Cmax: arr(cs[Math.floor(cs.length * 0.999)]),
      part: arr(c / n, 4), poids: arr(v / total, 3),
    })
  }
  familles.sort((p, q) => q.part - p.part)
  for (const f of familles) f.hex = oklchVersHex([f.L, f.C95, f.h])
  return {
    pixels: n,
    teintes: kmoyennes(pts, K).map((c) => fiche(c.lab, { part: arr(c.part, 4) })),
    ombres: fiche(moy((i) => Ls[i] <= bas)),
    lumieres: fiche(moy((i) => Ls[i] >= haut)),
    moyenne: fiche(moy(() => true)),
    chromaMax: arr(triC[Math.floor(n * 0.999)]),
    chromaMediane: arr(triC[n >> 1]),
    partColoree: arr(colores / n, 4),
    familles,
  }
}

function mesurer(nom, fichiers) {
  const morceaux = []
  let nImages = 0
  let part = 0
  const fonds = []
  for (const f of fichiers) {
    const { brut, n, W, H } = images(f)
    for (let k = 0; k < n; k++) {
      const { lab, sujet, fond, part: p } = analyserImage(brut, k * W * H * 3, W, H)
      const pts = []
      for (let i = 0; i < W * H; i++) if (sujet[i]) pts.push(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2])
      morceaux.push(Float32Array.from(pts))
      part += p
      fonds.push(fond)
      nImages++
    }
  }
  const total = morceaux.reduce((a, m) => a + m.length, 0)
  const pts = new Float32Array(total)
  let o = 0
  for (const m of morceaux) { pts.set(m, o); o += m.length }
  const fond = [0, 1, 2].map((c) => fonds.reduce((a, f) => a + f[c], 0) / fonds.length)
  return { nom, sources: fichiers.map((f) => path.relative(PUBLIC, f)), images: nImages, partSujet: arr(part / nImages), fond: fiche(fond), pts, ...statistiques(pts) }
}

// ── Sources ──────────────────────────────────────────────────────
const dans = (dossier, motif) => readdirSync(path.join(PUBLIC, dossier)).filter((f) => motif.test(f)).sort().map((f) => path.join(PUBLIC, dossier, f))
const CLIPS = [
  ...dans('visage', /^visage-\d\.webm$/).map((f) => [path.basename(f, '.webm'), [f]]),
  ...dans('assets', /^tete-.*\.webm$/).map((f) => [path.basename(f, '.webm'), [f]]),
  ['affiches', [...dans('visage', /poster.*\.webp$/), ...dans('assets', /^tete-.*poster\.webp$/)]],
]

const clips = CLIPS.map(([nom, fichiers]) => mesurer(nom, fichiers))
// Tous clips confondus : un pixel sur trois de chaque clip (même pas pour tous : la surface fait le poids)
const tousPts = []
for (const c of clips) for (let i = 0; i < c.pts.length / 3; i += 3) tousPts.push(c.pts[i * 3], c.pts[i * 3 + 1], c.pts[i * 3 + 2])
const ensemble = { nom: 'tous clips confondus', images: clips.reduce((a, c) => a + c.images, 0), partSujet: arr(clips.reduce((a, c) => a + c.partSujet * c.images, 0) / clips.reduce((a, c) => a + c.images, 0)), ...statistiques(Float32Array.from(tousPts)) }
// Fond moyen des clips (le vide derrière le visage)
ensemble.fond = fiche([0, 1, 2].map((k) => clips.reduce((a, c) => a + [c.fond.L, c.fond.C * Math.cos((c.fond.h * Math.PI) / 180), c.fond.C * Math.sin((c.fond.h * Math.PI) / 180)][k], 0) / clips.length))
// Les mp4 sont les mêmes clips en H.264 : on vérifie seulement que leur teinte d'ombre ne s'écarte pas
const mp4 = dans('visage', /^visage-\d\.mp4$/).map((f) => { const m = mesurer(path.basename(f), [f]); return { nom: m.nom, ombres: m.ombres, lumieres: m.lumieres, chromaMax: m.chromaMax } })

const propre = (c) => { const { pts, ...reste } = c; return reste }
const mesure = {
  methode: { largeur: LARGEUR, imagesParSeconde: 3, seuilSujetDeltaE: SEUIL_SUJET, k: K, seuilCouleur: 0.03 },
  ensemble: propre(ensemble),
  clips: clips.map(propre),
  mp4,
}
writeFileSync(path.join(ICI, 'visage-mesure.json'), JSON.stringify(mesure, null, 1) + '\n')

// ── Livrables (dossier donné) ────────────────────────────────────
const sortie = process.argv[2]
if (sortie) {
  mkdirSync(sortie, { recursive: true })
  writeFileSync(path.join(sortie, 'visage-mesure.json'), JSON.stringify(mesure, null, 1) + '\n')
  const lch = (t) => `oklch(${t.L} ${t.C} ${t.h})`
  const pc = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %'
  const md = []
  md.push('# Mesure des couleurs du visage (script `frontend/scripts/mesure-visage.mjs`)', '')
  md.push(`${ensemble.images} images, ${clips.length - 1} clips et ${CLIPS.at(-1)[1].length} affiches. Sujet séparé du fond par l'écart au fond (médiane de la couronne extérieure, seuil ${SEUIL_SUJET} ΔE OK) puis enveloppe ligne par ligne. Le sujet couvre ${pc(ensemble.partSujet)} de l'image en moyenne.`, '')
  md.push('## Tous clips confondus', '', '| Rôle | Aperçu | L | C | h | Part du sujet | D\'où elle vient |', '|---|---|---|---|---|---|---|')
  ensemble.teintes.forEach((t, i) => md.push(`| Teinte dominante ${i + 1} | \`${t.hex}\` | ${t.L} | ${t.C} | ${t.h}° | ${pc(t.part)} | k-moyennes OKLab, k = ${K} |`))
  md.push(`| Ombres | \`${ensemble.ombres.hex}\` | ${ensemble.ombres.L} | ${ensemble.ombres.C} | ${ensemble.ombres.h}° | 10 % | les 10 % les plus sombres du sujet |`)
  md.push(`| Lumières | \`${ensemble.lumieres.hex}\` | ${ensemble.lumieres.L} | ${ensemble.lumieres.C} | ${ensemble.lumieres.h}° | 10 % | les 10 % les plus clairs du sujet |`)
  md.push(`| Fond (hors sujet) | \`${ensemble.fond.hex}\` | ${ensemble.fond.L} | ${ensemble.fond.C} | ${ensemble.fond.h}° | — | médiane de la couronne, moyenne des clips |`)
  md.push('', `Chroma maximale réellement présente (99,9e centile) : **${ensemble.chromaMax}** ; chroma médiane : ${ensemble.chromaMediane} ; part du sujet réellement colorée (C ≥ 0,03) : ${pc(ensemble.partColoree)}.`, '')
  md.push('### Familles de teinte (pixels colorés, C ≥ 0,03)', '', '| Famille | Aperçu (C au 95e centile) | h | L moyen | C moyen | C 95e | C 99,9e | Part du sujet | Poids chromatique |', '|---|---|---|---|---|---|---|---|---|')
  ensemble.familles.forEach((f, i) => md.push(`| ${i + 1} | \`${f.hex}\` | ${f.h}° | ${f.L} | ${f.C} | ${f.C95} | ${f.Cmax} | ${pc(f.part)} | ${pc(f.poids)} |`))
  md.push('', '### Lecture', '',
    `**Le visage est presque monochrome** : ${pc(1 - ensemble.partColoree)} de sa surface a une chroma sous 0,03. Il n'a que deux familles de teinte : un bleu acier (des ombres à ${ensemble.ombres.h}° aux lumières à ${ensemble.lumieres.h}°, verre coloré à ${ensemble.familles[0].h}°, chroma ${ensemble.familles[0].Cmax} au plus) et, si elle est présente, une flamme rare${ensemble.familles[1] ? ` (${ensemble.familles[1].h}°, ${pc(ensemble.familles[1].part)} de la surface, chroma jusqu'à ${ensemble.familles[1].Cmax})` : ''}.`,
    'On n\'en tire donc aucune teinte nouvelle : la couleur d\'action et l\'accent sont ces teintes mesurées, à d\'autres clartés et d\'autres chromas (`frontend/scripts/palette-visage.mjs`). Le vert et le turquoise n\'existent pas dans le visage.')
  md.push('', '## Par clip', '', '| Clip | Images | Sujet | Ombres | Lumières | C max | Part colorée | Familles (h, part) |', '|---|---|---|---|---|---|---|---|')
  for (const c of clips) md.push(`| ${c.nom} | ${c.images} | ${pc(c.partSujet)} | ${lch(c.ombres)} | ${lch(c.lumieres)} | ${c.chromaMax} | ${pc(c.partColoree)} | ${c.familles.map((f) => `${f.h}° (${pc(f.part)})`).join(' · ')} |`)
  md.push('', '### Teintes dominantes par clip (k-moyennes)', '')
  for (const c of clips) md.push(`- **${c.nom}** : ${c.teintes.map((t) => `${lch(t)} ${pc(t.part)}`).join(' ; ')}`)
  md.push('', '### Contrôle des .mp4 (mêmes clips en H.264)', '')
  for (const m of mp4) md.push(`- ${m.nom} : ombres ${lch(m.ombres)}, lumières ${lch(m.lumieres)}, C max ${m.chromaMax}`)
  md.push('')
  writeFileSync(path.join(sortie, 'MESURE.md'), md.join('\n'))

  // Planche SVG : deux images du visage et leurs teintes (les libellés sont du texte SVG, rien n'est dessiné à la main)
  const png = (fichier, t) => ffmpeg(['-ss', String(t), '-i', fichier, '-frames:v', '1', '-vf', 'scale=240:-2', '-f', 'image2pipe', '-vcodec', 'png', '-']).toString('base64')
  const v1 = png(path.join(PUBLIC, 'visage', 'visage-1.webm'), 2.5)
  const v3 = png(path.join(PUBLIC, 'visage', 'visage-3.webm'), 2.5)
  const lignes = []
  let y = 54
  const titre = (t) => { lignes.push(`<text x="540" y="${y}" class="t">${t}</text>`); y += 14 }
  const pastille = (hex, libelle, largeur = 120) => {
    lignes.push(`<rect x="540" y="${y}" width="${Math.max(6, largeur)}" height="26" rx="4" fill="${hex}" stroke="#3a4656" stroke-width="1"/>`, `<text x="${540 + Math.max(6, largeur) + 12}" y="${y + 17}" class="l">${libelle}</text>`)
    y += 32
  }
  titre('Teintes dominantes (k-moyennes OKLab, largeur = part du sujet)')
  for (const t of ensemble.teintes) pastille(t.hex, `${lch(t)} · ${t.hex} · ${pc(t.part)}`, t.part * 520)
  y += 10; titre('Ombres (10 % les plus sombres) · lumières (10 % les plus clairs) · fond')
  pastille(ensemble.ombres.hex, `ombres ${lch(ensemble.ombres)} · ${ensemble.ombres.hex}`)
  pastille(ensemble.lumieres.hex, `lumières ${lch(ensemble.lumieres)} · ${ensemble.lumieres.hex}`)
  pastille(ensemble.fond.hex, `fond ${lch(ensemble.fond)} · ${ensemble.fond.hex}`)
  y += 10; titre('Familles de teinte des pixels colorés (aperçu à la chroma du 95e centile)')
  for (const f of ensemble.familles) pastille(f.hex, `h ${f.h}° · C moyen ${f.C} · C 95e ${f.C95} · ${pc(f.part)} du sujet`)
  const H = Math.max(y + 20, 420)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${H}" viewBox="0 0 1280 ${H}">
<style>.t{font:600 13px system-ui,sans-serif;fill:#dfe7f1}.l{font:12.5px ui-monospace,Menlo,monospace;fill:#c3cedb}.h{font:600 16px system-ui,sans-serif;fill:#fff}</style>
<rect width="1280" height="${H}" fill="#0b0f14"/>
<text x="24" y="30" class="h">Le visage de Synorix et ses teintes mesurées (${ensemble.images} images, OKLCH)</text>
<image x="24" y="48" width="240" height="360" href="data:image/png;base64,${v1}"/>
<image x="276" y="48" width="240" height="360" href="data:image/png;base64,${v3}"/>
${lignes.join('\n')}
</svg>
`
  writeFileSync(path.join(sortie, 'visage-teintes.svg'), svg)
}

const e = mesure.ensemble
console.log(`images ${e.images} · sujet ${e.partSujet} · ombres oklch(${e.ombres.L} ${e.ombres.C} ${e.ombres.h}) · lumières oklch(${e.lumieres.L} ${e.lumieres.C} ${e.lumieres.h}) · C max ${e.chromaMax} · coloré ${e.partColoree}`)
for (const t of e.teintes) console.log(`  teinte oklch(${t.L} ${t.C} ${t.h}) ${t.hex} ${t.part}`)
for (const f of e.familles) console.log(`  famille h ${f.h} L ${f.L} C ${f.C} C95 ${f.C95} Cmax ${f.Cmax} part ${f.part} poids ${f.poids}`)
console.log(`  fond oklch(${e.fond.L} ${e.fond.C} ${e.fond.h}) ${e.fond.hex}`)
