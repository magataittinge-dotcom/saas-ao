# Politique de confidentialité

**Dernière mise à jour : 4 mai 2026**

La présente politique décrit comment Synorix (ci-après « le Service »,
édité par [À COMPLÉTER]) collecte, utilise, stocke et protège les
données à caractère personnel de ses utilisateurs, conformément au
Règlement (UE) 2016/679 dit « RGPD » et à la loi française Informatique
et Libertés modifiée.

## 1. Responsable du traitement

- **Identité :** [À COMPLÉTER]
- **Adresse :** [À COMPLÉTER]
- **Email contact RGPD :** privacy@synorix.tech

À défaut de désignation d'un Délégué à la Protection des Données (DPO),
[À COMPLÉTER] assume cette fonction.

## 2. Données collectées

### 2.1 Données fournies par l'Utilisateur

| Catégorie | Données | Origine |
|---|---|---|
| Identité | Nom, prénom, email | Inscription Clerk |
| Entreprise | Raison sociale, SIRET, adresse, contacts | Profil entreprise |
| Paiement | Tokens de carte bancaire (jamais le numéro complet) | Stripe |
| Contenu professionnel | DCE uploadés, attestations, références chantiers, mémoires techniques, RIB, chiffres d'affaires | Coffre-fort & projets |

### 2.2 Données collectées automatiquement

| Catégorie | Données | Finalité |
|---|---|---|
| Logs techniques | Adresse IP, user-agent, horodatage des requêtes | Sécurité, débogage |
| Audit log | Action, ressource cible, métadonnées | Conformité, traçabilité |
| Stats produit | Nombre de DCE traités, plan actif | Facturation, support |

Aucune donnée de localisation précise (GPS) n'est collectée.

## 3. Finalités des traitements

| Finalité | Base légale (RGPD) | Données concernées |
|---|---|---|
| Création et gestion du compte | Exécution du contrat (art. 6.1.b) | Identité, entreprise |
| Fourniture du Service (analyse DCE, génération mémoire) | Exécution du contrat | Contenu professionnel |
| Facturation et paiement | Exécution du contrat | Identité, paiement |
| Sécurité et lutte contre la fraude | Intérêt légitime (art. 6.1.f) | Logs techniques |
| Audit log RGPD/SOC2 | Obligation légale + intérêt légitime | Audit log |
| Communication commerciale (newsletter) | Consentement (art. 6.1.a) | Email |

Aucune décision purement automatisée produisant des effets juridiques
n'est prise par Synorix au sens de l'article 22 du RGPD.

## 4. Durée de conservation

| Type de données | Durée |
|---|---|
| Compte actif | Pendant toute la durée d'utilisation du Service |
| Compte résilié — données utilisateur | 30 jours (récupération possible), puis suppression définitive |
| Factures et données comptables | 10 ans (obligation légale Code de commerce art. L. 123-22) |
| Logs techniques (sécurité) | 12 mois maximum |
| Audit log | 24 mois |
| Données de prospection (cookies analytics) | Non collectées (cf. politique cookies) |

## 5. Hébergement et localisation des données

- **Infrastructure principale :** Hostinger France (VPS Ubuntu, datacenter
  France).
- Les données stockées au repos sont chiffrées (AES-256).
- Les données en transit sont protégées par TLS 1.3.

Synorix s'engage à ce qu'**aucune donnée client ne soit stockée hors de
l'Union européenne** dans son infrastructure principale.

## 6. Sous-traitants

Synorix recourt à des sous-traitants pour assurer le fonctionnement du
Service. Tous sont engagés contractuellement à respecter le RGPD.

| Sous-traitant | Rôle | Localisation principale | Conformité |
|---|---|---|---|
| **Hostinger International Ltd** | Hébergement infrastructure | France | RGPD |
| **Stripe Payments Europe Ltd** | Paiement | Irlande (UE) | RGPD + PCI-DSS |
| **Anthropic, PBC** | API d'intelligence artificielle (Claude) | États-Unis | DPF (EU-US Data Privacy Framework) |
| **Clerk Inc.** | Authentification (gestion des comptes utilisateurs) | États-Unis | DPF + SOC 2 |

### 6.1 Transferts hors UE

Les sous-traitants Anthropic et Clerk étant établis aux États-Unis,
les transferts de données associés sont encadrés par le **EU-US Data
Privacy Framework (DPF)**, certifiant un niveau de protection adéquat
au sens de la décision d'adéquation de la Commission européenne du
10 juillet 2023.

### 6.2 Engagement IA

Synorix garantit que **les données client ne sont jamais utilisées pour
entraîner des modèles d'intelligence artificielle**. L'API Anthropic est
configurée en mode « no training » conformément aux conditions
contractuelles d'Anthropic pour les comptes commerciaux.

## 7. Sécurité

Synorix met en œuvre les mesures techniques et organisationnelles
appropriées pour garantir la sécurité des données :

- Chiffrement AES-256 au repos
- Chiffrement TLS 1.3 en transit
- Authentification forte via Clerk (gestion des sessions, tokens JWT)
- Cloisonnement strict par organisation (isolation logique multi-tenant)
- Journalisation des accès (audit log)
- Sauvegardes quotidiennes chiffrées avec rétention 30 jours
- Mises à jour de sécurité régulières
- Politique de gestion des mots de passe (Clerk)
- Accès aux données restreint aux personnes habilitées

## 8. Droits de l'Utilisateur

Conformément au RGPD, l'Utilisateur dispose des droits suivants :

| Droit | Description |
|---|---|
| **Accès (art. 15)** | Obtenir la confirmation que des données sont traitées et en obtenir une copie |
| **Rectification (art. 16)** | Corriger des données inexactes ou incomplètes |
| **Effacement / droit à l'oubli (art. 17)** | Demander la suppression de ses données (sauf obligation légale de conservation) |
| **Limitation (art. 18)** | Demander la limitation temporaire d'un traitement |
| **Portabilité (art. 20)** | Récupérer ses données dans un format structuré, lisible par machine (export JSON/ZIP) |
| **Opposition (art. 21)** | S'opposer à un traitement fondé sur l'intérêt légitime |
| **Retrait du consentement** | Pour les traitements fondés sur le consentement (newsletter), retrait possible à tout moment |
| **Directives post-mortem** | Définir le sort de ses données après son décès |

### 8.1 Modalités d'exercice

- **Auto-service :** la plupart des droits sont exerçables directement
  depuis le compte utilisateur (rectification du profil, export, suppression
  du compte).
- **Demande écrite :** privacy@synorix.tech avec justificatif d'identité.
- **Délai de réponse :** 1 mois maximum, prolongeable de 2 mois en cas de
  demande complexe.

### 8.2 Réclamation

L'Utilisateur peut introduire une réclamation auprès de la Commission
Nationale de l'Informatique et des Libertés (CNIL) :
[https://www.cnil.fr/fr/plaintes](https://www.cnil.fr/fr/plaintes).

## 9. Cookies

Une politique cookies dédiée est accessible à l'adresse [/legal/cookies](/legal/cookies).

## 10. Modification de la politique

La présente politique peut être modifiée pour s'adapter aux évolutions
légales, jurisprudentielles ou techniques. Toute modification
substantielle sera notifiée à l'Utilisateur par email au moins 30 jours
avant son entrée en vigueur.

## 11. Contact

Pour toute question relative à la présente politique ou à l'exercice
des droits RGPD :

- **Email :** privacy@synorix.tech
- **Courrier :** [À COMPLÉTER : adresse postale]
