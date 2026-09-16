# SameProof

SameProof is a mobile-first Next.js prototype that turns a possible monitor price match into an explainable evidence journey. It does not make an AI eligibility decision or hide uncertainty behind a percentage. Instead, deterministic TypeScript engines show which identity and retailer-policy rules pass, fail, or remain unknown—and the Near-Miss Engine tests the closest permitted change when a comparison is blocked.

This repository implements the SIT774 10.3HD prototype that extends the 7.3HD SameProof concept.

## What is implemented

The five-stage journey is fully connected and resumable with the same `comparisonId`:

1. **Offers** — a pair-first view labelled **Product I want** and **Lower price I found**, with URL, barcode/photo and manual input available for either side. Prepared assessment scenarios remain optional.
2. **Evidence** — review one source at a time, see where and when it came from, confirm visible facts explicitly, and leave missing or unreviewed values Unknown.
3. **Same product?** — a difference-first bridge explains exact commercial identity before a separate server policy check.
4. **Best next step** — follows the policy constraint path, names the first blocker and offers one dominant safe change without relaxing a selected must-have.
5. **Passport** — a compact three-lane proof for product identity, lower price and retailer policy, with a freshness countdown, integrity verification and presentation/share controls.

Other demonstrable browser features include IndexedDB recovery for the comparison, catalogue and last decision; Service Worker app-shell caching; Web Crypto; `getUserMedia`; `BarcodeDetector` with ZXing fallback; File/Canvas APIs; Web Share; and a PWA Share Target manifest.

## Architecture

SameProof is one modular Next.js monolith. Route Handlers are the backend-for-frontend; there is no separate Express service.

```text
ProductIdentity
     ↓
RetailerListing → OfferObservation
     ↓                 ↓
          Comparison
         ↙          ↘
IdentityDecision   PolicyDecision
         \          /
          NearMissResult
                ↓
       PriceMatchPassport
```

```text
app/                       App Router pages and Node.js API Route Handlers
components/                Accessible, responsive journey UI
lib/identity-engine/       Strict commercial and explanatory functional checks
lib/policy-engine/         Allowlisted, data-driven policy predicates
lib/near-miss-engine/      Framework-independent counterfactual routing
lib/passport-engine/       Snapshot and SHA-256 integrity generation
lib/database/              Repository boundary, Atlas and demo adapters
lib/validation/            Zod request validation
workers/                   Browser Web Worker entry point
models/                    Shared domain types
tests/                     Unit, API integration and browser journey tests
```

The decision engines accept plain TypeScript data and have no React, Next.js, MongoDB or DOM dependency. API Route Handlers validate untrusted input, call the application service/repository boundary, and return controlled error envelopes.

## Run locally

Requirements: Node.js 20.9 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. With no database environment variables the app deliberately enters **demo mode**, using the complete seeded catalogue in process. Every seeded offer is visibly described as simulated.

Copy `.env.example` to `.env.local` to use MongoDB Atlas:

```dotenv
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER_HOST/sameproof?retryWrites=true&w=majority
MONGODB_DB_NAME=sameproof
SAMEPROOF_DEMO_MODE=false
```

The URI is server-only—never prefix it with `NEXT_PUBLIC_`. On the first request, the Atlas adapter creates indexes and seeds catalogue collections only when `retailers` is empty.

## MongoDB model

| Collection | Purpose |
| --- | --- |
| `retailers` | Retailer identity and basic information |
| `products` | Canonical monitor identities |
| `listings` | Persistent retailer pages and sellers |
| `offerObservations` | Time-stamped price and stock records |
| `policyVersions` | Versioned retailer rules |
| `comparisons` | Workflow state and confirmed evidence |
| `decisions` | Immutable evaluation results |
| `passports` | Time-bounded evidence snapshots |

Indexes are created for GTIN, normalized model, retailer SKU, source URL, observation recency, policy effective date, comparison TTL, decision recency, passport token uniqueness and passport TTL. Optional unique values use partial indexes rather than a compound sparse index. Raw public tokens are never stored; `passports.publicTokenHash` is uniquely indexed instead.

MongoDB TTL deletion is asynchronous, so APIs also reject expired comparisons and passports before returning them. `Comparison.version` is used for optimistic concurrency: an outdated browser tab receives a `409 VERSION_CONFLICT` instead of silently overwriting newer evidence.

## Prepared demonstrations

The seed contains 5 monitor families, 25 retailer listings, 6 Australian retailer/seller identities, 2 versioned policy interpretations and 10 named scenarios.

| Scenario | Demonstrates |
| --- | --- |
| Exact eligible match | Exact AU identity and lower comparable total |
| Regional suffix conflict | Same specifications cannot override commercial identity |
| Warranty difference | Commercial warranty mismatch |
| Bundle mismatch | Added accessory changes the offer |
| Delivery reversal | Delivery removes the saving; pickup becomes a safe route |
| Marketplace exclusion | Seller eligibility blocks the current offer |
| Unavailable stock | Current stock is required |
| Expired evidence | A recheck route that marks dynamic facts unconfirmed instead of changing timestamps |
| Incomplete identity | Missing identifiers stay Unknown |
| Discretionary retailer | Rule-complete result remains Likely, not guaranteed |

See [the walkthrough](docs/TUTORIAL.md) for a concise demonstration script.

## Error and exception policy

- Zod rejects malformed requests at the public API boundary.
- Domain/application errors use typed codes and appropriate HTTP status values.
- Route handlers attach a request ID, log structured server details, and return a safe client message.
- Atlas connection failures do not silently fall back when `SAMEPROOF_DEMO_MODE=false`.
- Missing dependencies, expired records, invariant violations and optimistic concurrency conflicts are distinguished.
- Client screens preserve retryable errors, announce changing results, and store local drafts before navigation.
- Camera and image decoding errors stop media tracks and explicitly offer upload/manual recovery.
- Decisions and passports are immutable inserts; a passport is refused unless its decision matches the current comparison version.
- Process-local prototype rate limits protect mutating endpoints, and response headers set CSP, clickjacking, MIME-sniffing and referrer protections.
- **Delete comparison** removes its comparison, decisions and passports from the active repository, plus the current browser draft.

## Accessibility and responsive behavior

- Mobile-first layout checked at 375px and desktop at 1440px with no horizontal overflow.
- Semantic landmarks, headings, labels, fieldsets, tabs, status regions and live announcements.
- Keyboard-operable journey with visible focus indicators and 44px minimum controls.
- Icons and text accompany colour states.
- `prefers-reduced-motion` removes non-essential animation.
- Loading, invalid, empty, offline, conflict and expired states are explicit.
- Evidence editing uses a single-offer mobile view and side-by-side desktop view.

The target is WCAG 2.2 AA; formal conformance still requires an external accessibility audit with representative assistive technologies.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The 33-test unit and API integration suite covers normalization, all 10 decision themes, strict identity separation, confirmed-evidence trust, incomplete numeric evidence, timestamp-only refresh resistance, near-miss safety, stable hashing, raw-token protection, deletion, version conflicts, validation envelopes and the complete server passport path. Playwright covers the exact-match journey, the delivery near-miss explanation and mobile overflow. Install its browser once with `pnpm exec playwright install chromium` before running E2E locally. If that CDN is unavailable and Google Chrome is already installed, run with `PLAYWRIGHT_CHANNEL=chrome` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'`).

## Trust boundaries and limitations

- Seeded prices and stock are simulated—not guaranteed live data.
- Only known seeded URLs resolve automatically. An unknown URL requires manual confirmation.
- SameProof does not universally scrape retailers, perform universal screenshot OCR, infer every suffix, use AI for eligibility, authenticate users, locate them precisely, or guarantee retailer approval.
- Policies are controlled data. MongoDB may store only allowlisted fields and operators, never executable JavaScript.
- Product identity, evidence freshness and policy eligibility are related but remain distinct conclusions.
- Freshness is derived from the source times of decisive price, delivery and stock evidence. Updating only `observedAt` cannot make stale evidence current; those dynamic fields must be rechecked and confirmed.

## Policy sources

The seeded policy records are explicitly labelled **prototype interpretations**. They link to the current official [Officeworks Price Beat Guarantee](https://www.officeworks.com.au/information/policies/price-beat-guarantee) and [JB Hi-Fi price-match help page](https://www.jbhifi.com.au/pages/help-and-support/360053193014-what-is-the-jb-hi-fi-price-match-policy-). Policies are versioned and snapshot into each passport because retailer wording can change.
