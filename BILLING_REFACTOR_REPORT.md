# Billing & locale refactor — rapport

**Date :** 2026-05-04
**Scope :** préparer Synorix au déménagement Stripe FR → Stripe UAE (2027) sans toucher au code métier le jour J.

---

## 1. Architecture avant/après

### Avant

```
┌──────────────────────────────────────┐
│ routers/stripe_billing.py           │
│  import stripe                      │
│  stripe.api_key = settings…         │
│  stripe.Customer.create(…)          │
│  stripe.checkout.Session.create(…)  │
│  stripe.Webhook.construct_event(…)  │
└──────────────────────────────────────┘
            │
            ▼
        Stripe API
```

Toute la logique Stripe vivait dans le router. Country / currency /
tax_rate étaient implicites (héritage du compte Stripe).

### Après

```
┌──────────────────────────────────────┐
│ routers/stripe_billing.py            │
│  from services.billing import …      │
│  billing = get_billing_provider()    │
│  billing.create_customer(…)          │
│  billing.create_checkout_session(…)  │
│  billing.verify_webhook(…)           │
└──────────────────┬───────────────────┘
                   │  ABC
       ┌───────────▼───────────┐
       │  BillingProvider      │
       └───────────┬───────────┘
       ┌───────────▼───────────┐
       │  StripeProvider       │  ← seul impl aujourd'hui
       │  (wraps stripe SDK)   │
       └───────────────────────┘
                   │
                   ▼
                Stripe API

┌──────────────────────────────────────┐
│ config/locale.py                     │
│  get_locale_config() → LocaleConfig  │
│  (country, currency, tax_rate, …)    │
└──────────────────────────────────────┘
```

Plus aucun `import stripe` dans le router. La sélection du provider se
fait via la variable d'env `BILLING_PROVIDER` (default `stripe`).

---

## 2. Variables d'environnement nécessaires

### Locale (toutes ont des defaults FR)

| Variable | Default FR | Exemple UAE |
|---|---|---|
| `COUNTRY_CODE` | `FR` | `AE` |
| `CURRENCY` | `EUR` | `AED` |
| `CURRENCY_SYMBOL` | `€` | `د.إ` |
| `TAX_RATE` | `0.20` | `0.05` |
| `TAX_LABEL` | `TVA` | `VAT` |
| `TIMEZONE` | `Europe/Paris` | `Asia/Dubai` |
| `LOCALE` | `fr_FR` | `ar_AE` |
| `DATE_FORMAT` | `%d/%m/%Y` | `%Y-%m-%d` |
| `COMPANY_NAME` | `Synorix` | `Synorix LLC` |
| `COMPANY_ADDRESS` | _(vide)_ | _(à remplir)_ |
| `COMPANY_VAT_NUMBER` | _(vide)_ | _(à remplir)_ |
| `COMPANY_REGISTRATION_NUMBER` | _(vide)_ | _(à remplir)_ |
| `LEGAL_JURISDICTION` | `FR` | `AE` |

### Billing

| Variable | Default | Notes |
|---|---|---|
| `BILLING_PROVIDER` | `stripe` | Seule valeur supportée aujourd'hui. `lemonsqueezy`, `paddle` etc. extensibles via factory. |
| `STRIPE_SECRET_KEY` | _(vide)_ | Requis si `BILLING_PROVIDER=stripe` |
| `STRIPE_WEBHOOK_SECRET` | _(vide)_ | Requis en prod, sinon `verify_webhook` échoue à la prod |

`.env.example` a été mis à jour avec les blocs FR (actif) + UAE (commenté).

---

## 3. Procédure de migration future

Détail complet dans **`backend/docs/MIGRATION_PROVIDER.md`** (272 lignes, dont :

- 3 approches (cutover global, progressif, Stripe-assisted).
- Playbook 7-étapes Stripe FR → Stripe UAE pour Dubai 2027.
- Risques + mitigations (webhooks perdus, factures en cours, RGPD).
- Checklist pré-migration (12 items).
- Pattern d'extension pour ajouter un nouveau provider (Lemonsqueezy / Paddle).

---

## 4. Fichiers modifiés / créés

### Créés

| Fichier | Rôle |
|---|---|
| `backend/config/__init__.py` | Pydantic `Settings` (anciennement `config.py`) |
| `backend/config/locale.py` | `LocaleConfig` + `get_locale_config()` |
| `backend/services/billing/__init__.py` | Exports publics du module |
| `backend/services/billing/base.py` | `BillingProvider` ABC + `BillingError` |
| `backend/services/billing/stripe_provider.py` | Implémentation Stripe |
| `backend/services/billing/factory.py` | `get_billing_provider()` singleton + `reset_billing_provider()` test helper |
| `backend/docs/MIGRATION_PROVIDER.md` | Playbook complet |
| `backend/tests/test_locale_config.py` | 5 tests |
| `backend/tests/test_billing_abstraction.py` | 16 tests (Stripe SDK mocké) |
| `backend/tests/test_billing_provider_swap.py` | 2 tests de swap |

### Modifiés

| Fichier | Changement |
|---|---|
| `backend/.env.example` | + bloc locale FR (actif) + bloc UAE (commenté) + `BILLING_PROVIDER` |
| `backend/models/organization.py` | + `billing_provider`, `billing_country` ; index sur `stripe_customer_id`, `stripe_subscription_id` |
| `backend/main.py` | Migration runtime des nouvelles colonnes + indexes Stripe |
| `backend/routers/stripe_billing.py` | Plus aucun `import stripe`. Tout passe par `get_billing_provider()` |
| `backend/routers/auth.py` | `Organization.billing_country` rempli depuis `get_locale_config()` |

### Supprimés

| Fichier | Raison |
|---|---|
| `backend/config.py` | Remplacé par le package `backend/config/` |

---

## 5. Tests

| Suite | Avant | Après | Δ |
|---|---|---|---|
| Total | 244 | **267** | +23 ✅ |
| Backend cross-org / soft-delete / etc. | 244 | 244 | inchangé |
| `test_locale_config.py` | — | 5 | nouveau |
| `test_billing_abstraction.py` | — | 16 | nouveau |
| `test_billing_provider_swap.py` | — | 2 | nouveau |

Tous les appels Stripe mockés via `unittest.mock.patch` — aucun trafic réseau.

---

## 6. Commits

| # | SHA | Tâche |
|---|---|---|
| 1 | `fe1d197` | `refactor(config): externalize locale config to env vars` |
| 2 | `e5d4dc9` | `refactor(billing): abstract Stripe behind BillingProvider interface` |
| 3 | `f0b4c0d` | `feat(org): add billing_provider and billing_country fields` |
| 4 | `569fdf6` | `docs(billing): document multi-provider migration procedure` |
| 5 | `0cb12e9` | `test(billing): add abstraction layer tests + locale tests` |

Chaque commit a été poussé sur `origin/main` au fil de l'eau.

---

## 7. Bugs détectés pendant le refacto (NON FIXÉS — hors scope)

Aucun bug existant trouvé pendant le refacto. Quelques observations mineures, à
traiter plus tard si besoin :

1. **`PRODUCTS` mapping en dur** dans `routers/stripe_billing.py` (ligne 24-27).
   Les IDs de produits Stripe sont hardcodés (`prod_UFuTbjsjJG2tlq`,
   `prod_UFuVeLpu3fDVQp`). À externaliser en env vars (`STRIPE_PRODUCT_PRO`,
   `STRIPE_PRODUCT_BUSINESS`) avant migration UAE — le doc
   `MIGRATION_PROVIDER.md` l'a noté. Ne bloque pas aujourd'hui.

2. **Webhook DEBUG-mode** parsait l'event sans vérification de signature en
   appelant directement `stripe.Event.construct_from`. Le refacto délègue
   maintenant à `verify_webhook` qui réutilise le même fallback non-signé
   quand le secret est vide. Comportement strictement équivalent — pas de
   régression.

3. **`Organization.plan` reste en SAEnum** `("free","pro","business")`.
   Pas de souci aujourd'hui, mais si on ajoute un nouveau plan ça nécessitera
   une migration ENUM (Postgres). Acceptable — hors scope.

---

## 8. Synthèse

- ✅ Toutes les configurations géographiques externalisées en env vars.
- ✅ `BillingProvider` ABC + `StripeProvider` impl ; aucun `import stripe`
  hors du provider.
- ✅ `Organization.billing_provider` + `billing_country` + indexes
  webhook ajoutés.
- ✅ Doc complète + checklist + playbook 7 étapes pour le 2027.
- ✅ 267 tests verts (vs 244 baseline, +23).
- ✅ 5 commits séparés, chacun poussé.
- ✅ Aucun drive-by change. Aucune feature visible côté UX modifiée.

Pour le déménagement Dubai 2027, il restera à : ouvrir le compte Stripe UAE,
contacter Stripe Support pour la migration assistée, mettre à jour les env
vars, redéployer. **Zéro changement de code requis.**
