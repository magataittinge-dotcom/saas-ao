# Quick wins visuels appliqués (Nuit 4, Bloc 3)

Périmètre strict : corrections **triviales, sûres, sans changement de sémantique ni de layout**, build vérifié. Tout ce qui touche une sémantique ou un layout = laissé pour la passe design de demain.

## Appliqué (1)
1. **StepMemoire — accent « Critères de jugement détectés » remis sur la charte.** Indigo hors-charte (`#818CF8`, fond `rgba(99,102,241,0.10)`) → cyan charte (`#0284C7`, fond `rgba(14,165,233,0.10)`, cohérent avec `pill-cyan`). Icône + badges. Swap pur de valeurs couleur, 0 logique. **Build `tsc && vite build` vert.**

## Volontairement NON touché (laissé à la passe design / risque)
- **Amber « Expire bientôt »** (CandidatureSectionVault, CandidatureSectionTemplates, VaultPickerModal, StepUpload, ExpiryAlert) : la charte impose slate pour warning, MAIS l'amber/orange est une **convention UX forte pour l'expiration**. Changer à l'aveugle réduirait la clarté. → **Décision design demain** (trancher : amber d'expiration toléré, ou slate strict + icône). Incohérence connexe à arbitrer : `StatusBadge.documentStatusBadge` mappe « Expire bientôt » en variant *slate*, alors que ces composants utilisent l'amber en direct.
- **Icône fichier .docx bleue (`#3B82F6`, StepUpload:52)** : convention « Word = bleu » pour les types de fichier. Pas une vraie violation de charte (couleur fonctionnelle, pas accent). Laissée.
- **PaymentCard** (amber/or/rouge) : couleurs de **marque** (Visa/Mastercard) — légitimes, ne pas charter.
- **Navy sombre** (Login/Register/Landing/viewer PDF) : thèmes sombres **intentionnels**.
- **Skeleton** : le `#0C1222` n'est qu'en commentaire (ancien bug déjà corrigé en `#F1F5F9`). RAS.

## Note
La majorité des incohérences couleur (amber d'expiration surtout) relèvent d'une **décision de design** (cohérence sémantique) mieux traitée demain avec Claude Design en une passe homogène, plutôt qu'en swaps nocturnes risqués. Le seul swap appliqué cette nuit (indigo→cyan) était sans ambiguïté décoratif et sans risque sémantique.
