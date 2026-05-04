# Multi-provider billing — architecture & migration playbook

**Last reviewed :** 2026-05-04
**Audience :** Synorix tech lead. Read this when:
- Switching the Stripe account (e.g. Stripe FR → Stripe UAE in 2027)
- Replacing Stripe with another provider (Lemonsqueezy, Paddle, …)
- Splitting cohorts across two providers temporarily

---

## 1. Architecture today

```
┌──────────────────────────────────┐
│ FastAPI routes                   │
│  routers/stripe_billing.py       │
│  - create-checkout-session       │
│  - portal                        │
│  - verify-session                │
│  - webhook                       │
└──────────────┬───────────────────┘
               │  uses get_billing_provider()
               ▼
┌──────────────────────────────────┐
│ services/billing/               │
│  ┌────────────────────────────┐ │
│  │ BillingProvider (ABC)      │ │  ← provider-agnostic interface
│  └─────────────┬──────────────┘ │
│  ┌─────────────▼──────────────┐ │
│  │ StripeProvider             │ │  ← only impl today
│  │   wraps the `stripe` SDK   │ │
│  └─────────────┬──────────────┘ │
└────────────────┼─────────────────┘
                 │
                 ▼
              Stripe API
```

### What the abstraction buys us

| Property | Without abstraction | With abstraction |
|---|---|---|
| Swap Stripe-FR → Stripe-UAE | edit every endpoint | change env vars + redeploy |
| Add Lemonsqueezy provider | rewrite billing layer | add one file |
| Mock provider in tests | monkeypatch `stripe` SDK | inject a stub provider |
| Keep webhook signature check | spread across handlers | encapsulated in `verify_webhook` |

The router never imports `stripe`. The only Stripe-specific concept that
remains is the `Stripe-Signature` HTTP header — we read it in the
webhook handler, but the actual signature check is delegated to
`provider.verify_webhook(...)`.

---

## 2. Adding a new billing provider

### 2.1 Create the provider class

`backend/services/billing/lemonsqueezy_provider.py` :

```python
from .base import BillingError, BillingProvider

class LemonsqueezyProvider(BillingProvider):
    def __init__(self, api_key: str, signing_secret: str):
        self._api_key = api_key
        self._signing_secret = signing_secret

    def create_customer(self, email, name=None, metadata=None): ...
    def create_subscription(self, customer_id, price_id, metadata=None): ...
    # … implement every abstract method
    def verify_webhook(self, payload, signature):
        # MUST authenticate the payload before returning
        ...
```

Every method must:

* Return primitives (`str` / `dict`) — never an SDK-specific object.
* Translate provider errors into `BillingError`.
* Be re-entrant (no shared state outside the instance).

### 2.2 Register in the factory

Edit `backend/services/billing/factory.py` :

```python
def _build(name: str) -> BillingProvider:
    if name == "stripe":
        return StripeProvider(...)
    if name == "lemonsqueezy":
        from .lemonsqueezy_provider import LemonsqueezyProvider
        s = get_settings()
        return LemonsqueezyProvider(
            api_key=s.LEMONSQUEEZY_API_KEY,
            signing_secret=s.LEMONSQUEEZY_SIGNING_SECRET,
        )
    raise ValueError(...)
```

### 2.3 Add provider settings + env

* Add fields to `Settings` (`backend/config/__init__.py`).
* Add the env vars to `.env.example`.
* Switch with `BILLING_PROVIDER=lemonsqueezy`.

### 2.4 Tests

* Add a test class mirroring `test_billing_abstraction.py` with mocks
  of the SDK.
* Add a swap test in `test_billing_provider_swap.py`.

---

## 3. Migrating clients between providers

### Approach 1 — Global cutover (≤ 50 paying clients)

1. Spin up the new provider account.
2. Schedule a 1-hour maintenance window with prior notice.
3. Pause all subscriptions on the old provider (Stripe Dashboard).
4. Recreate customers + subscriptions on the new provider via a
   migration script (`scripts/migrate_billing_provider.py`).
5. Switch `BILLING_PROVIDER` env + redeploy.
6. Resume billing.

Risk: a single window of downtime. Acceptable for a small base.

### Approach 2 — Progressive (cohort-based, > 50 clients)

1. Enable both providers in parallel — implementations coexist; only
   the factory picks one at a time *at the process level*.
2. For per-org overrides, switch on `Organization.billing_provider` in
   the routes (today the routes always call `get_billing_provider()`,
   but a small switch can be added that reads
   `org.billing_provider` first).
3. Migrate batches of customers manually or via script (e.g. 10 / day).
4. Invariant: webhooks from BOTH providers must be accepted during the
   migration window. Add a second route (e.g.
   `/api/lemonsqueezy/webhook`) and route accordingly.

### Approach 3 — Stripe-assisted account migration

For a country switch *within* Stripe (FR → UAE), Stripe Support runs an
**assisted migration** that transfers `customer.id`s and tokenized
payment methods. The customer never re-enters their card.

This is the right path for the 2027 Dubai move.

---

## 4. Procedure : Stripe France → Stripe UAE (Dubai 2027)

> Stripe FR and Stripe UAE are two separate accounts. The Stripe Support
> ticket is the unlocking step.

### Step 1 — 4 to 8 weeks before the move

- Open the **Stripe UAE** account (requires the UAE legal entity).
- Activate live mode (KYC, wire-bank verification).
- Create the same products / prices as on FR (use a side-by-side
  spreadsheet to track the mapping `prod_FR → prod_UAE`).
- Update `PRODUCTS` mapping in `routers/stripe_billing.py` if the
  product IDs change. (Better: move it to env vars in the same pass.)

### Step 2 — Open a Stripe Support ticket

- Subject: *"Account migration: France → UAE — same legal beneficial owner"*.
- Provide: both account ids, list of customers/subscriptions to migrate,
  preferred cutover date.
- Stripe Support will:
  - Transfer `customer.id`s from FR to UAE (kept identical).
  - Re-issue `pm_…` ids if needed.
  - Replay tokenized cards.
  - Provide a new `STRIPE_WEBHOOK_SECRET`.

### Step 3 — Prepare the prod env

```diff
# /etc/synorix/synorix.env
- STRIPE_SECRET_KEY=sk_live_FR_…
- STRIPE_WEBHOOK_SECRET=whsec_FR_…
+ STRIPE_SECRET_KEY=sk_live_UAE_…
+ STRIPE_WEBHOOK_SECRET=whsec_UAE_…

# Locale flip (cf .env.example)
- COUNTRY_CODE=FR
- CURRENCY=EUR
- TAX_RATE=0.20
- TIMEZONE=Europe/Paris
- LEGAL_JURISDICTION=FR
+ COUNTRY_CODE=AE
+ CURRENCY=AED
+ TAX_RATE=0.05
+ TIMEZONE=Asia/Dubai
+ LEGAL_JURISDICTION=AE
```

### Step 4 — Cutover day

1. Confirm with Stripe Support that migration is complete on their side.
2. Update env vars in Hostinger (cf step 3).
3. `systemctl restart synorix-api` (zero-downtime via uvicorn workers reload).
4. Tail `journalctl -u synorix-api -f`.

### Step 5 — Verify webhooks

- Check Stripe UAE Dashboard → Developers → Webhooks → Latest events.
- Test with `stripe trigger customer.subscription.updated` (CLI).
- Hostinger logs should show `200` for the new webhook secret.

### Step 6 — Communications

- Email all paying customers:
    > « Notre service continue normalement, vos abonnements et factures
    > sont préservés. Vous n'avez aucune action à effectuer. La
    > facturation passe à compter du XX/XX/2027 sous notre nouvelle
    > entité Synorix LLC (UAE), avec une TVA locale (5 %). »

### Step 7 — Decommission

After a 7-day soak:
- Disable the old FR webhook in the FR Dashboard.
- Keep the FR account in read-only for 6 months (compliance / litigation).

---

## 5. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Webhook events lost between cutover and DNS propagation | Medium | Keep both webhooks active for 7 days post-cutover (Stripe will replay) |
| In-flight invoices billed in EUR after cutover | Low | Finish the current billing cycle on FR; cutover at the start of a new cycle |
| Customer in trial / paused | Low | Stripe Support's assisted migration handles them |
| Regression on a corner case route | Medium | Run the regression test suite (Task 5) + smoke-test in staging |
| Tax rate mismatch in invoices issued just after cutover | Medium | Update Stripe Tax settings in the new account before cutover |
| RGPD / data residency concerns | Low | Stripe UAE keeps data in Stripe's EU + US infra; we keep our app data in Hostinger France until further notice |

---

## 6. Pre-migration checklist

Run this 1 week before the cutover.

- [ ] Stripe UAE account live & KYC complete
- [ ] All products / prices mirrored UAE side
- [ ] `PRODUCTS` mapping in `routers/stripe_billing.py` matches new IDs (or moved to env var)
- [ ] `.env.uae.production` prepared with all secrets
- [ ] Stripe Support migration ticket opened, ETA confirmed
- [ ] Customer comms email drafted (FR + EN versions)
- [ ] Hostinger panel access verified (env vars + restart capability)
- [ ] `git log --oneline -5` matches the commit deployed to prod
- [ ] Last 7 days of Stripe FR webhooks replayed locally (none should fail)
- [ ] Backup of the prod DB taken (≤ 24h old)
- [ ] Rollback procedure rehearsed (downgrade env vars, restart, tail)

---

## 7. Code locations involved

- `backend/services/billing/base.py` — interface
- `backend/services/billing/stripe_provider.py` — Stripe impl
- `backend/services/billing/factory.py` — provider selection
- `backend/services/billing/__init__.py` — public exports
- `backend/routers/stripe_billing.py` — endpoints
- `backend/models/organization.py` — `billing_provider`, `billing_country`
- `backend/config/locale.py` — country / currency / tax / timezone
- `backend/main.py` — runtime migration of new columns
- `backend/.env.example` — both FR (active) and UAE (commented) configs

If you add or rename anything billing-related, update this file and the
test suite (`tests/test_billing_*.py`).
