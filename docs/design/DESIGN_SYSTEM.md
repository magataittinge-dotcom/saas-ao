# Synorix — Design System (référentiel)

> Référentiel extrait du frontend réel (`frontend/src`, `tailwind.config.js`, `index.css`). À fournir à Claude Design / Figma MCP pour générer **dans l'identité Synorix** (cohérence totale, pas de générique). Stack : React 18 + TypeScript + Tailwind + React Router v6 + lucide-react. Mode **light SaaS**.

## 1. Typographie
- **Police principale** : **DM Sans** (`font-sans` / `font-display`) — titres ET corps. `system-ui, sans-serif` en fallback.
- **Mono** : JetBrains Mono (`font-mono`) — usage code/montants techniques rare.
- Échelle observée : `text-2xl font-bold` (titres de page), `text-base font-bold` (titres de carte), `text-sm` (corps), `text-xs` (méta/labels), `text-[11px]` (sur-méta).
- Poids : 600 (semibold) pour boutons/titres de section, 700 (bold) pour titres/chiffres clés.

## 2. Palette (tokens `ds-*` — règle stricte 4 rôles)
Identité = **cyan + slate + rouge + émeraude (réservée)**. NE PAS introduire d'autres teintes (pas de violet, orange vif, dégradé arc-en-ciel).

| Rôle | Token | Hex |
|---|---|---|
| **Accent / IA / info / success** | `ds-cyan` / `ds-accent` / `ds-success` | **#0EA5E9** |
| Cyan clair | `ds-cyan-light` | #38BDF8 |
| Cyan foncé (hover) | `ds-cyan-dark` | #0284C7 |
| Neutre / warning | `ds-warning` | #64748B (slate) |
| Danger | `ds-danger` | #EF4444 (texte #DC2626) |
| **Gagné / Conforme UNIQUEMENT** | `ds-gagne` | #10B981 (émeraude — réservé, ne pas utiliser ailleurs) |
| Texte principal | `ds-text` | #0F172A |
| Texte fort | `ds-text-1b` | #1E293B |
| Texte secondaire | `ds-text-2` | #64748B |
| Texte tertiaire / muted | `ds-text-3` / `ds-text-muted` | #94A3B8 |
| Texte dim | `ds-text-dim` | #CBD5E1 |
| Fond page | `ds-bg` | #FFFFFF |
| Fond 2 (zones, inputs) | `ds-bg-2` | #F8FAFC |
| Fond 3 | `ds-bg-3` | #F1F5F9 |
| Bordure subtile | `ds-border-subtle` | #E2E8F0 |
| Bordure hover | `ds-border-hover` | #CBD5E1 |
| Halo cyan léger (icônes) | — | #F0F9FF |

**Règle sémantique stricte** (gravée dans le code) : cyan = info/IA/succès, slate = neutre/warning, rouge = danger, **émeraude = Gagné/Conforme seulement**.

## 3. Rayons, ombres, dégradés
- **Rayons** : cartes `rounded-xl` (0.75rem) / `rounded-2xl` (1rem) ; boutons `rounded-lg`/`rounded-xl` ; pills `rounded-full`.
- **Ombres** (`tailwind.config`) : `shadow-card` = `0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)` ; `shadow-card-hover` = `0 4px 12px rgba(0,0,0,.08), 0 0 0 1px rgba(14,165,233,.08)` ; `shadow-glow-cyan` = `0 0 12px rgba(14,165,233,.15)`.
- **Dégradés** : `gradient-signature` = `135deg #0F172A→#1E293B→#0369A1` (boutons premium, sidebar accent) ; `gradient-cyan` = `90deg #0EA5E9→#0284C7` (barres de progression) ; `gradient-subtle` (fonds cyan très légers).
- **Easing** : `cubic-bezier(0.4,0,0.2,1)` (token `smooth`), transitions 0.15–0.2s.

## 4. Animations (`tailwind.config` keyframes)
`animate-fade-in` (entrée page, translateY 8px + opacity), `animate-shimmer` (skeletons), `animate-pulse-glow`, `animate-wave`, `accordion-down/up`, + `animate-tip-in` (AiTip).

## 5. Classes utilitaires custom (`index.css`) — À RÉUTILISER
| Classe | Rôle |
|---|---|
| `glass-card` | Carte standard : blanc, bordure #E2E8F0, `rounded-2xl`, ombre card, hover bordure+halo cyan. **Le conteneur par défaut.** |
| `btn-primary` | Bouton principal cyan (#0EA5E9 → hover #0284C7), translateY hover. |
| `btn-glass` / `btn-outline` / `btn-ghost` / `btn-destructive` | Variantes boutons. |
| `signature-btn` / `signature-gradient` | Bouton premium dégradé sombre→cyan (actions fortes : générer, exporter). |
| `input-dark` | Champ de saisie clair (#F8FAFC, focus bordure cyan + halo). **Le champ par défaut.** |
| `pill` + `pill-{cyan,success,gagne,conforme,warning,danger,muted}` | Badges/étiquettes statut. |
| `table-dark` | Table (header #F8FAFC, zébrage even #F8FAFC, hover cyan léger). |
| `nav-item` (`.active`) | Item de sidebar (barre cyan active). |
| `progress-track` / `progress-bar-gradient` / `progress-fill` | Barres de progression. |
| `card-premium` / `gradient-border` / `ai-badge` / `glow-*` | Accents premium / IA. |
| `text-gradient` | Titre en dégradé sombre→cyan (#0F172A→#0369A1). |
| `stat-icon-bg` / `divider` / `avatar-ring` | Petits éléments. |

## 6. Inventaire des composants réutilisables

### `components/common/`
| Composant | Rôle | Props clés |
|---|---|---|
| `StatusBadge` | Badge statut (variants success/warning/danger/info/neutral) + helpers `complianceStatusBadge`, `documentStatusBadge`, `projectStatusBadge` | `label`, `variant` |
| `AiTip` / `AiTipsBlock` | Encart conseil IA (info/warning/success), dismissible, `animate-tip-in` | `tip{id,variant,text}`, `onDismiss` |
| `ProgressDisplay` | Cercle SVG de progression + lerp **monotone** (modal/inline) | `steps`, `currentStep`, `progress`, `phase`, `variant` |
| `Toast` | Notifications | — |
| `DeleteConfirmModal` | Modal confirmation suppression | — |
| `ExpiryAlert` | Alerte expiration document (coffre-fort) | — |
| `FileCard` | Carte fichier (vault) | — |
| `PaymentCard` / `SubscriptionWall` | Paiement / paywall | — |
| `Skeleton` (+ `skeletons/index.tsx`) | États de chargement shimmer | — |
| `PlanetBackground` | Fond décoratif (landing/auth) | — |

### `components/layout/`
`Layout` (shell sidebar+header+outlet), `Sidebar` (nav 9 items, `nav-item`), `Header` (breadcrumb `ROUTE_LABELS` + recherche), `LegalFooter`.

### `components/project/`
`StepProgress` (stepper 6 étapes), `AnalysisProgress`, `DocumentViewer`, `PdfViewerModal`, `VaultPickerModal`, `CandidatureSectionTemplates`, `CandidatureSectionVault`.

### `components/dashboard/`
`AOCard`, `AlertCard`, `StatsBar`.

### `components/ui/` — **VIDE** (pas de shadcn installé malgré les vars CSS) → formulaires en Tailwind inline.

## 7. Inventaire des pages (`routes/`)
Pipeline projet (`Project.tsx` → 6 sous-routes) : `StepUpload` (637 l), `StepLotSelection` (791), `StepAnalysis` (678), `StepCandidat` (247), `StepMemoire` (1284), `StepExport` (738).
Hors pipeline : `Dashboard` (565), `Landing` (911), `Tools`/Calculateurs (429), `MemoireConfig` (771), `Billing` (392), `Projects` (213), `Legal` (207), `NewProject` (189), `Pricing` (180), `Settings` (172), `Company` (135), `Vault` (128), `Login`/`Register` (112), `References` (91), `Team` (63).

## 8. Conventions de génération (pour Claude Design)
1. **Toujours** : DM Sans, conteneur `glass-card`, accent `#0EA5E9`, champs `input-dark`, badges `pill-*` / `StatusBadge`, conseils via `AiTip`.
2. **Palette 4-rôles stricte** — jamais de couleur hors-charte. Émeraude (#10B981) **uniquement** Gagné/Conforme.
3. Wrapper de page : `max-w-5xl mx-auto space-y-6 animate-fade-in`, header = icône cyan (24px lucide) + `h1 text-2xl font-bold text-ds-text` + sous-titre `text-sm text-ds-text-2`.
4. Interactions : `cursor-pointer` sur cliquables, transitions `smooth` 0.15–0.2s, hover discret (bordure/halo cyan).
5. Icônes : **lucide-react** exclusivement.
6. Réutiliser les composants existants (§6) avant d'en créer ; tout nouveau composant suit ces tokens.
