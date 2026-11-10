// Types de scripts/couleur.mjs (calculs de couleur partagés par les scripts de palette et les tests).
type Triplet = [number, number, number]
export function versLineaire(v: number): number
export function versGamma(v: number): number
export function lineaireVersOklab(rgb: number[]): Triplet
export function oklabVersLineaire(lab: number[]): Triplet
export function oklabVersOklch(lab: number[]): Triplet
export function oklchVersOklab(lch: number[]): Triplet
export function lineaireSrgbVersP3(rgb: number[]): Triplet
export function lineaireP3VersSrgb(rgb: number[]): Triplet
export function dansGamut(lch: number[], gamut?: 'srgb' | 'p3'): boolean
export function ramener(lch: number[], gamut?: 'srgb' | 'p3'): Triplet
export function chromaMax(L: number, h: number, gamut?: 'srgb' | 'p3'): number
export function oklchVersHex(lch: number[]): string
export function hexVersOklch(c: string | number[]): Triplet
export function oklchVersP3(lch: number[]): string
export function luminanceLineaire(rgb: number[]): number
export function lire(c: string): { lin: Triplet; a: number }
export function versOklch(c: string): Triplet
export function poser(avant: string, fond: string): Triplet
export function contraste(avant: string, fond: string): number
export function ecartTeinte(a: number, b: number): number
export function deltaE(p: number[], q: number[]): number
export function daltonien(lin: number[], type: 'deuteranope' | 'protanope'): Triplet
export function aplatir(avant: string, fond: string): string
export function vue(c: string, type?: 'deuteranope' | 'protanope' | null): Triplet
