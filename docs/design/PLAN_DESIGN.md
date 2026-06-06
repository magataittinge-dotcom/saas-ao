# Plan du chantier DESIGN (à dérouler au réveil)

Objectif : rendre Synorix **visuellement pro** pour (1) la démo Adil et (2) la landing + pub. Outils : **Claude Design / Figma MCP** (UI du SaaS) + **Higgsfield** (landing + vidéo pub). Référentiel à fournir aux outils : **`DESIGN_SYSTEM.md`** (identité Synorix) ; état des écrans : **`AUDIT_UI.md`**.

## 0. Connecter les outils (Customize > Connectors), dans l'ordre
1. **Claude Design / Figma MCP** — pour générer/refondre les écrans du SaaS dans la charte.
2. **Higgsfield** — pour la landing (visuels d'ambiance) + la vidéo pub (UGC).
> Donner systématiquement `DESIGN_SYSTEM.md` en contexte au générateur pour rester dans la charte (DM Sans, cyan #0EA5E9, glass-card, 4 rôles couleur).

## 1. Ordre recommandé des écrans (impact d'abord)

### Vague A — Démo Adil (le parcours qu'il verra)
Priorité : un parcours produit **impeccable** de bout en bout.
1. **Dashboard** (1ère impression) — refonte/polish avec Claude Design. Modèle interne de cohérence = **StepExport** (déjà pro).
2. **Pipeline 6 étapes** — homogénéiser sur StepExport : Upload, LotSelection, Analyse, Candidature, **Mémoire** (le plus dense), Export. Surtout StepMemoire + StepUpload (couleurs/poli).
3. **Tools / Calculateurs** — déjà propre, vérifier juste l'harmonie.
4. **Projects / Vault / References / MemoireConfig** — polish léger (déjà corrects).

### Vague B — Acquisition (landing + pub)
5. **Landing** — refonte complète (vitrine) + visuels **Higgsfield** (ambiance BTP/tech, hero).
6. **Pricing / Billing / paywall** — refonte (historiquement « moche »).

## 2. Outil par type d'écran
| Type | Outil | Pourquoi |
|---|---|---|
| Écrans SaaS (dashboard, pipeline, formulaires) | **Claude Design / Figma MCP** | génère dans la charte, composants réutilisables |
| Landing (sections marketing, hero) | **Claude Design** (structure) + **Higgsfield** (visuels) | mix structure + images d'ambiance |
| Vidéo pub | **Higgsfield** | UGC / ambiance |

## 3. Captures nécessaires (une fois les écrans beaux) — pour landing + pub
À capturer **après** la refonte (écrans réels, données de démo propres) :
- **Dashboard** (vue d'ensemble AO + stats) — hero produit de la landing.
- **Analyse / matrice de conformité** (StepAnalysis) — montre l'extraction IA + traçabilité source.
- **Mémoire technique généré** (StepMemoire, vue éditeur) — le livrable phare.
- **Calculateurs** (Tools : jauge OAB) — différenciateur visuel parlant.
- **Export / dossier AO** (StepExport) — le résultat final (DOCX/ZIP).
- **Checklist candidature** (StepCandidat) — pièces à fournir.
> Préparer un **projet de démo** propre (DCE réaliste, profil entreprise rempli) pour des captures crédibles.

### Visuels Higgsfield (landing + pub)
- **Ambiance** : chantier BTP moderne + interface tech (cyan), professionnel/rassurant (acheteurs publics).
- **Pub UGC** : conducteur de travaux / dirigeant PME BTP qui répond à un AO en quelques clics ; angle « gagner du temps + ne plus rater de pièce ».

## 4. Garde-fous design (rappels)
- Rester dans la **charte 4 rôles** (cyan/slate/rouge/émeraude-réservée) — `DESIGN_SYSTEM.md`.
- Réutiliser les composants existants (StatusBadge, AiTip, glass-card, ProgressDisplay) avant d'en créer.
- Ne pas casser le câblage fonctionnel (les écrans sont branchés aux endpoints — refondre le visuel, pas la logique).
- Build `tsc && vite build` vert après chaque écran.

## TOP 3 à attaquer en premier
1. **Dashboard** (1ère impression Adil) avec Claude Design.
2. **StepMemoire + StepUpload** (poli + couleurs charte) — homogénéiser sur StepExport.
3. **Landing** (refonte + Higgsfield) pour préparer l'acquisition.
