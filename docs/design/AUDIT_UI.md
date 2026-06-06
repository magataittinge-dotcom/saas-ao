# Audit UI — état visuel écran par écran

> Audit **basé sur le code** (adhérence aux tokens charte, couleurs hors-palette, richesse/structure), pas un rendu pixel. À confirmer visuellement demain. Méthode : scan des hex hors-charte + usage des composants/classes du Design System + structure. Charte de référence : `DESIGN_SYSTEM.md` (4 rôles : cyan/slate/rouge/émeraude).

## Synthèse couleurs hors-charte détectées
| Couleur | Où | Verdict |
|---|---|---|
| **Amber/orange** (#F59E0B, #FBBF24, #F97316, #F79E1B) | Landing, StepUpload, CandidatureSectionVault, VaultPickerModal, CandidatureSectionTemplates, PaymentCard | ⚠️ **hors-charte** (la charte impose **slate** pour warning) — sauf PaymentCard (logo Mastercard, légitime). **Quick win.** |
| **Indigo/bleu** (#3B82F6, #818CF8, #4B6CB7) | StepUpload, StepMemoire, PaymentCard | ⚠️ **hors-charte** (accent doit être cyan #0EA5E9). **Quick win** (si décoratif). |
| **Or/gold** (#D4AF37, #F5D76E) | PaymentCard | ✅ légitime (puce/marque carte). |
| **Navy near-black** (#0C1017, #0A0E14, #0D1117…) | Login, Register, Landing, DocumentViewer, PdfViewerModal | ✅ intentionnel (héros sombre auth/landing, fond viewer PDF). |
| **Navy dans Skeleton.tsx** | Skeleton | ⚠️ à vérifier — skeletons sombres sur pages claires = vestige thème dark possible. |

## Tableau écran par écran

| Écran | Lignes | État (code) | Incohérences | Priorité refonte |
|---|---|---|---|---|
| **Landing** | 911 | Riche, marketing, héros sombre | amber décoratif ; gros fichier (sections variées) | 🔴 **Refonte design** (vitrine — Claude Design + Higgsfield) |
| **Dashboard** | 565 | Données réelles, composants dédiés (AOCard/StatsBar/AlertCard) | peu de `glass-card` direct (délègue aux composants) — vérifier cohérence cartes | 🟠 Polish (1ère impression Adil) |
| **StepUpload** | 637 | Fonctionnel (dropzone, SSE) | amber + indigo hors-charte ; crawl progress (cf. Nuit 3) | 🟠 Polish + harmonisation couleurs |
| **StepLotSelection** | 791 | Fonctionnel (détection async) | à vérifier visuellement | 🟡 Correct |
| **StepAnalysis** | 678 | Matrice conformité, recherche | à vérifier | 🟡 Correct |
| **StepCandidat** | 247 | Checklist + vault picker | amber warnings (CandidatureSection*) hors-charte | 🟠 Quick win couleurs |
| **StepMemoire** | 1284 | Le plus gros, éditeur + génération | indigo hors-charte ; densité d'UI à auditer visuellement | 🟠 Polish |
| **StepExport** | 738 | SummaryCard/Accordion soignés (réf. design interne) | cohérent (bon modèle) | 🟢 Pro (sert de référence) |
| **Tools / Calculateurs** | 429 | Récent, charte respectée (StatusBadge/AiTip/input-dark) | RAS | 🟢 Pro |
| **MemoireConfig** | 771 | 19 usages charte — très aligné | RAS notable | 🟢 Correct/Pro |
| **Billing** | 392 | PaymentCard (couleurs marque OK) | paywall « moche » (noté memoire projet avril) | 🔴 Refonte (pricing/paywall) |
| **Pricing** | 180 | Marketing | peu de tokens charte (1) | 🟠 Polish/refonte |
| **Projects** | 213 | Liste + glass-card | correct | 🟢 Correct |
| **References** | 91 | Table charte (`table-dark` style) | bouton « Ajouter » non fonctionnel (`_showForm` inutilisé) | 🟡 Correct (+ bug bouton) |
| **Vault** | 128 | Délègue à FileCard/ExpiryAlert | amber expiry (ExpiryAlert) à vérifier vs charte | 🟡 Correct |
| **Company / Settings / Team** | 135/172/63 | Formulaires | basiques, à vérifier alignements | 🟡 Correct/basique |
| **Login / Register** | 112/112 | Clerk thème sombre centré | intentionnel | 🟢 OK |

## Quick wins visuels (Bloc 3 — sûrs) vs refontes lourdes (demain)

### Quick wins candidats (corrections triviales, à fort impact cohérence)
1. **Amber/orange → slate** (token charte warning) dans CandidatureSectionVault, CandidatureSectionTemplates, VaultPickerModal, StepUpload — là où l'amber sert d'état « warning/attention » (la charte impose slate #64748B). ⚠️ vérifier au cas par cas que ce n'est pas une sémantique voulue.
2. **Indigo (#3B82F6/#818CF8) → cyan #0EA5E9** dans StepUpload/StepMemoire si décoratif (accent).
3. **Skeleton.tsx** : vérifier que les couleurs ne sont pas un vestige dark sur fond clair.
4. `cursor-pointer` manquants / états hover sur éléments cliquables (à repérer).

### Refontes lourdes (demain, Claude Design / Figma MCP)
- 🔴 **Landing** (vitrine) — refonte complète + visuels Higgsfield.
- 🔴 **Billing/Pricing/paywall** (« moche » historiquement).
- 🟠 **Dashboard** (1ère impression démo Adil).
- 🟠 Polish pipeline (StepMemoire, StepUpload) — homogénéiser sur le modèle **StepExport** (déjà pro).

## Verdict
**Écrans pro/cohérents** : StepExport, Tools, MemoireConfig (bon socle charte). **À polir** : Dashboard, StepMemoire, StepUpload (couleurs hors-charte). **À refondre (demain)** : Landing, Billing/Pricing. Le **modèle interne de référence** = StepExport (SummaryCard/Accordion). Les incohérences couleur (amber/indigo) sont les **quick wins** les plus rentables. **Rien refondu cette nuit.**
