# Plan de Reponse a Incident — Synorix (SaaS AO BTP)

## Contact d'urgence

| Role | Nom | Contact |
|------|-----|---------|
| Responsable technique | Mohamed Omarov | [email personnel] |
| DPO (si designe) | A definir avant mise en prod | - |

## 1. Detection et evaluation

### Signaux d'alerte
- Alerte monitoring (erreurs 500 en masse, latence anormale)
- Connexion suspecte dans les logs (IP inconnue, tentatives brute force)
- Notification Clerk (activite anormale sur un compte)
- Rapport utilisateur (donnees corrompues, acces non autorise)
- Alerte Stripe (paiements suspects)

### Evaluation de la severite

| Niveau | Description | Exemples |
|--------|-------------|----------|
| P0 — Critique | Donnees personnelles exposees, systeme compromis | Fuite BDD, cle API compromise, ransomware |
| P1 — Majeur | Service degrade, risque potentiel | Serveur inaccessible, erreurs en masse |
| P2 — Mineur | Impact limite, pas de fuite de donnees | Bug UI, lenteur temporaire |

## 2. Confinement immediat (P0)

### Etape 1 : Isoler le serveur (< 15 min)
```bash
# Couper le reverse proxy (Nginx)
sudo systemctl stop nginx

# Ou bloquer le port 443 si Nginx ne repond pas
sudo ufw deny 443
sudo ufw deny 80

# Couper l'acces a la BDD depuis l'exterieur
sudo ufw deny 5432
```

### Etape 2 : Revoquer les secrets compromis
- **Cle API Anthropic** : regenerer sur console.anthropic.com
- **Cle Stripe** : regenerer sur dashboard.stripe.com/apikeys
- **Clerk** : regenerer sur dashboard.clerk.com
- **AWS** : desactiver la cle IAM, en creer une nouvelle
- **SECRET_KEY** : regenerer avec `openssl rand -hex 32`

### Etape 3 : Sauvegarder les preuves
```bash
# Copier les logs avant toute modification
cp /var/log/nginx/access.log /tmp/incident_$(date +%Y%m%d)/
cp /var/log/nginx/error.log /tmp/incident_$(date +%Y%m%d)/
journalctl -u saas-ao --since "24 hours ago" > /tmp/incident_$(date +%Y%m%d)/app.log

# Snapshot de la BDD
pg_dump "$DATABASE_URL" > /tmp/incident_$(date +%Y%m%d)/db_snapshot.sql
```

## 3. Investigation

### Verifier les logs
```bash
# Connexions suspectes
grep "401\|403\|500" /var/log/nginx/access.log | tail -100

# Requetes anormales (injection, path traversal)
grep -i "union\|select\|drop\|\.\./" /var/log/nginx/access.log

# Activite API inhabituelle
grep "POST /api" /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

### Verifier les acces BDD
```sql
-- Derniers utilisateurs crees (compte compromis ?)
SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 10;

-- Organisations avec plan modifie recemment
SELECT id, name, plan, updated_at FROM organizations ORDER BY updated_at DESC LIMIT 10;
```

## 4. Notification CNIL (obligation legale)

### Quand notifier ?
- **Obligatoire sous 72h** si la violation concerne des donnees personnelles ET presente un risque pour les droits et libertes des personnes.
- Donnees concernees dans Synorix : emails, noms, SIRET, documents BTP (potentiellement confidentiels).

### Comment notifier ?
1. Aller sur : https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles
2. Remplir le formulaire de notification
3. Informations requises :
   - Nature de la violation (confidentialite, integrite, disponibilite)
   - Categories de personnes concernees
   - Nombre approximatif de personnes
   - Consequences probables
   - Mesures prises pour remedier

### Notification aux utilisateurs
Si le risque est eleve (donnees sensibles exposees) :
- Envoyer un email a tous les utilisateurs affectes
- Indiquer : ce qui s'est passe, quelles donnees, quoi faire (changer mdp, etc.)
- Delai : des que possible apres la notification CNIL

## 5. Remediation

### Checklist post-incident
- [ ] Secrets regeneres et deployes
- [ ] Vulnerabilite identifiee et corrigee
- [ ] Patch deploye et teste
- [ ] Logs d'incident archives
- [ ] CNIL notifiee (si applicable)
- [ ] Utilisateurs notifies (si applicable)
- [ ] Post-mortem redige
- [ ] Mesures preventives identifiees

### Post-mortem (template)
```
Date de l'incident : YYYY-MM-DD
Duree : X heures
Impact : [nombre d'utilisateurs, donnees concernees]
Cause racine : [description]
Timeline :
  HH:MM — Detection
  HH:MM — Confinement
  HH:MM — Resolution
Actions correctives :
  1. [action] — responsable — deadline
  2. [action] — responsable — deadline
```

## 6. Prevention

### Mesures en place
- Auth via Clerk (MFA disponible)
- Chiffrement HTTPS (TLS)
- Headers de securite (HSTS, X-Content-Type-Options, X-Frame-Options)
- Rate limiting sur endpoints sensibles
- Validation des inputs (Pydantic)
- Verification signature webhooks Stripe
- Isolation des donnees par organisation
- Backups quotidiens automatises

### A mettre en place avant scaling
- Monitoring applicatif (Sentry ou equivalent)
- Alertes sur erreurs 500 en masse
- Scan de vulnerabilites regulier (dependabot, npm audit)
- Audit de securite annuel
- Formation securite equipe
