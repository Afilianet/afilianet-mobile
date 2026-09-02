# Afilianet Mobile

The Afilianet mobile app, built with [Expo](https://expo.dev), React Native, and TypeScript. This guide assumes no prior programming experience.

Sign in with a real email and password — the login screen talks to afilianet-api's Sanctum-backed login endpoint, and everything past it (organizations, home dashboard, wallet, commissions, compliance status) talks to real, working backend endpoints too.

## 1. Install dependencies

You'll need [Node.js](https://nodejs.org) installed (version 20.19 or newer). Then, from this folder:

```bash
npm install
```

## 2. Set up your environment file

Copy the example environment file:

```bash
cp .env.example .env
```

_(On Windows PowerShell: `Copy-Item .env.example .env`)_

Then, in a separate terminal, start the backend using its Docker Compose stack:

```bash
cd ../afilianet-api
docker compose up -d
```

This starts everything the API needs — `app`, `horizon` (queue worker), `nginx`, Postgres, and Redis — with `nginx` published on `http://localhost:8000`, matching `.env`'s default `EXPO_PUBLIC_API_BASE_URL`. Leave it running (`docker compose ps` to check status, `docker compose logs -f app` to tail logs). You may need to change `EXPO_PUBLIC_API_BASE_URL` depending on how you're running the mobile app — see "Changing the API URL" below.

Docker is the primary, supported way to run the backend for this project — prefer it over `php artisan serve`, which isn't part of the documented workflow here (queued jobs like notification dispatch rely on `horizon`, which only runs inside the Compose stack).

`docker compose up -d` does **not** start the `identity-engine` service (the real OCR engine behind `identity_document` document capture) by default — it has no `depends_on` coupling to the rest of the stack. To exercise the real document-capture flow (not just its surrounding screens), also run `docker compose up -d identity-engine` and set `IDENTITY_ENGINE_URL=http://identity-engine:8000` / `IDENTITY_ENGINE_SERVICE_TOKEN=local-dev-only-insecure-token` in `afilianet-api`'s `.env` — see that repo's `docs/identity/IDENTITY_ENGINE.md` section M. Without it, `identity_document` processing attempts fail closed with a clear "unavailable" result in local/dev too (never a fabricated pass).

## 3. Start the app

```bash
npm start
```

This opens Expo's developer tools in your terminal (and a QR code). From here you can press:

- `a` to open on a connected **Android** emulator or device
- `i` to open on an **iOS Simulator** (Mac only)
- or scan the QR code with the **Expo Go** app on your own phone (iOS or Android — install it from the App Store / Play Store first)

### Opening on Android

- **Emulator:** Install Android Studio, create a virtual device, start it, then run `npm start` and press `a`.
- **Physical phone:** Install the **Expo Go** app from the Play Store, then scan the QR code shown in the terminal. Your phone and computer must be on the same Wi-Fi network.

### Opening on iPhone

- **Simulator (Mac only):** Install Xcode, then run `npm start` and press `i`.
- **Physical phone:** Install the **Expo Go** app from the App Store, then scan the QR code shown in the terminal (or in the browser window Expo opens) using your iPhone's Camera app. Your phone and computer must be on the same Wi-Fi network.

## Changing the API URL

Edit `EXPO_PUBLIC_API_BASE_URL` in your `.env` file. Which value to use depends on how you're testing:

All of these assume `docker compose up -d` is running in `afilianet-api` (see above), with `nginx` published on port 8000.

| How you're running the app | Value to use | Why |
| --- | --- | --- |
| iOS Simulator | `http://127.0.0.1:8000` (the default) | The simulator shares your computer's network, so `localhost`/`127.0.0.1` reaches it directly. |
| Android Emulator | `http://10.0.2.2:8000` | The emulator has its own virtual network and can't resolve `localhost` or `127.0.0.1` as "the host machine." `10.0.2.2` is Android's built-in alias for that. |
| Physical phone (iPhone or Android) | `http://<your-computer's-LAN-IP>:8000` | Another device on your Wi-Fi can't reach `127.0.0.1` or `10.0.2.2` at all — those only resolve to "this same device." Find your computer's LAN IP address (Windows: run `ipconfig` and look for "IPv4 Address") and use that instead. |

After changing `.env`, stop and restart `npm start` (Expo only reads `.env` at startup).

## Switching between development, staging, and production

This app supports three environments, each with its own settings file:

- `.env` — used by `npm start` (development, edited by you locally)
- `.env.staging` — used by `npm run start:staging`
- `.env.production` — used by `npm run start:production`

`.env.staging` and `.env.production` don't exist until you create them — copy `.env.staging.example` / `.env.production.example` and fill in the real staging/production API URLs (and Sentry/PostHog keys, once you have them). These files are intentionally left out of git (see `.gitignore`) since they may eventually hold real credentials — never commit them.

## Signing in during development

Use any real account's email and password. If you need a throwaway account to test with, create one through the Docker container (from the `afilianet-api` folder):

```bash
docker compose exec app php artisan tinker
```

A user on its own can sign in, but can't do much until it also belongs to an organization as an affiliate — create both together:

```php
use App\Modules\Users\Models\User;
use App\Modules\Organizations\Models\Organization;
use App\Modules\Organizations\Enums\MembershipRole;
use App\Modules\Organizations\Enums\MembershipStatus;
use App\Modules\Affiliates\Services\AffiliateEnrollmentService;

$user = User::factory()->create([
    'email' => 'test@example.com',
    'password' => \Illuminate\Support\Facades\Hash::make('Password123!'),
]);
$org = Organization::factory()->create(['name' => 'Test Org']);
$org->memberships()->create([
    'user_id' => $user->id,
    'role' => MembershipRole::Affiliate,
    'status' => MembershipStatus::Active,
    'joined_at' => now(),
]);
app(AffiliateEnrollmentService::class)->enroll($org, $user); // status starts "pending"
```

Both `active` and `pending` accounts can sign in; `suspended` and `blocked` accounts get a clear error instead. Always create the affiliate profile via `AffiliateEnrollmentService::enroll()`, not a raw model `create()` — it's what dispatches the `AffiliateEnrolled` event the rest of the domain (including notifications) depends on.

**To actually exercise the real `identity_document` document-capture flow** (not just have it fall through to the Fake provider), the organization needs `compliance_config.providers.identity_document` explicitly set to `"afilianet"` when you create it — an organization with no `providers` key resolves every compliance step to the Fake provider by default, regardless of whether a real document-processing attempt happened:

```php
$org = Organization::factory()->create([
    'name' => 'Test Org',
    'compliance_config' => [
        'required_steps' => ['identity_document', 'terms_acceptance'],
        'providers' => ['identity_document' => 'afilianet'],
    ],
]);
```

When you're done with a throwaway account, delete its organization (cascades every domain row it owns) and the user itself:

```php
Organization::find($org->id)->delete();
User::find($user->id)->delete();
```

## The compliance verification simulator

Three compliance step types (`biometric_liveness`, `verbal_consent`, and read-only `identity_information`) have no real verification provider behind them yet — afilianet-api only implements Fake/test providers for these. To exercise them in development, the app shows an additional **development-only pass/fail simulator** on each of those steps, gated by `isDevelopmentSimulatorEnabled` in `src/config/env.ts` (`__DEV__ && EXPO_PUBLIC_APP_ENV=development` — both conditions, so it can never appear in a release build regardless of how one is misconfigured). `terms_acceptance` has a real, user-submittable production path, and `identity_document`/`face_match` now have real capture flows too (see below) — the simulator still appears alongside each, for quick QA, but is never the primary interaction for those steps.

**This simulator must never be reachable outside local development.** Don't set `EXPO_PUBLIC_APP_ENV=development` in a staging or production environment file.

## Identity document capture (`identity_document`)

The app has a real camera-capture flow for the `identity_document` compliance step, driving afilianet-api's Afilianet Document Engine end-to-end — not a simulation. Supported document types (exactly what the backend has a real parser for; the app never invents a third option):

- **Mexican INE** (`mx_ine`) — captures the **front and back**.
- **Passport** (`passport`) — captures the **identity page**.

**Flow**: choose a document type → capture each required side with the device camera (with a guidance screen, a local preview, and Retake before uploading) → each photo is uploaded through the real Phase 9B evidence flow (`POST .../evidence/uploads` → a direct PUT to the returned URL, S3 in production and a signed local route in dev → `POST .../evidence/{evidence}/complete`) → `POST .../document-processing` triggers async OCR/parsing → the app polls `GET .../document-result` (stopping automatically once the attempt completes or fails) → the normalized result (verdict + whatever fields OCR actually found) is shown to the affiliate → if the backend says confirmation is needed, the affiliate reviews/corrects the extracted values and submits them via `PATCH .../document-result` (see "Field confirmation" below).

**Permissions**: the app requests camera access only (`expo-image-picker`'s `NSCameraUsageDescription` on iOS, `android.permission.CAMERA` on Android) — photo-library and microphone permissions are explicitly disabled in `app.json`'s plugin config, since this flow never picks from the library or records audio. A denied/restricted permission shows a clear in-app message with a link to the device's Settings, not a silent failure.

**Field confirmation (Phase 9C.2a)**: a real, backend-authoritative flow. When `GET .../document-result` reports `confirmation_status: "pending"` (and the verdict isn't `fail` — a failed verification is never presented as something confirming text can "fix"), the app shows an editable form pre-filled with the extracted values and submits corrections via `PATCH .../document-result`, `{"fields": {...}}` — exactly the field names/values the backend returned, never a broader schema invented client-side. `extracted_fields` (what OCR produced) and `confirmed_fields` (what the affiliate confirmed/corrected) stay visually distinct; confirming never rewrites the former. Confirming is a self-attestation ("I confirm these are my identity details") — it **never** changes `ComplianceStep`/`ComplianceCase` state, never overrides a `fail`/`review` verdict, and never implies document authenticity or government/biometric verification on its own; the app never locally marks a step approved/passed as a result of confirming. Resubmitting the *same* values is a safe no-op; resubmitting *different* values after a result is already confirmed gets a `409` — the app treats that as a hard stop (shows the authoritative confirmed values, never auto-retries, never silently overwrites).

**Provider-aware, server-authoritative (Phase 9C.2a)**: this flow only appears when `ComplianceStep.configured_provider === "afilianet"` **and** `provider_actionable === true` — both read directly from the backend, never inferred from `provider` (which only ever reflects the latest attempt, and is null before one exists) and never assumed for an unconfigured/null provider. `configured_provider === "incode"` shows its own distinct "different flow" message (a future SDK-driven flow); Afilianet-configured-but-not-actionable (e.g. the real OCR engine isn't operationally enabled) shows a safe "temporarily unavailable" state with a manual "Check again" — never the camera/upload UI, and never framed as a document problem. The app never chooses a provider itself. Triggering processing can also come back `503` (engine unavailable, discovered by the backend's own gate) even after entry was allowed — handled the same way: a distinct, non-alarming "temporarily unavailable" message with a manual retry (never an automatic retry loop, never treated as a rejected document).

**Privacy**: no document image, extracted field value, confirmed field value, CURP, passport number, elector key, evidence id, or step id is ever sent to analytics or logged. Temporary local captures are deleted after a successful upload.

**Current limitation, stated plainly**: real OCR (Tesseract, via a separate `afilianet-identity-engine` service) has only been validated in this project against clean, rendered synthetic test images — not real phone-camera photos, not multiple INE layout generations. A real, working pipeline is not the same claim as a production-validated identity-verification capability — see `afilianet-api/docs/identity/IDENTITY_ENGINE.md` section R for the full, honest breakdown. Real camera-device capture (actual permission prompts, actual photos) has not been manually verified on a physical device or simulator in this development environment either — only the surrounding screens' bundling and the backend contract have been.

## Face match capture (`face_match`)

The app has a real selfie-capture flow for the `face_match` compliance step, driving afilianet-api's Afilianet Face Match integration (Phase 9D.2) end-to-end — not a simulation. **This phase is face match only** — no liveness challenge, no anti-spoofing, no document re-validation, no verbal consent, no face enrollment/database, and no client-side similarity/threshold tuning; the app never attempts any of that.

**What a "Face matched" result actually means, and what it doesn't**: a `match` verdict means only *"the selfie appears sufficiently similar to the identity document's portrait according to the configured face-comparison engine."* It does **not** mean liveness was checked, the document is authentic, the affiliate's government identity has been verified, or fraud has been ruled out. The app never says "Identity verified" for a face-match result — only "Face matched" or equivalent — and liveness remains a distinct, not-yet-built future step (see "Deferred" below).

**Ordering dependency**: face match requires a completed `identity_document` result to source a reference portrait from. The app never locally infers "the document step is done enough" — it reacts to the backend's own signal (a `409` at the trigger step if no usable reference exists yet) and shows safe guidance pointing back at the Identity document step, rather than guessing ahead of the backend.

**A real, non-obvious architecture detail**: the `face_match` compliance step does not accept its own evidence upload — afilianet-api only allows `selfie` evidence against the sibling `biometric_liveness` step's id (and reads it back case-wide when face-match processing runs). The app resolves that sibling step from the case's full steps list before ever offering selfie capture, and shows a safe "isn't fully set up for this organization yet" message if an organization enabled `face_match` without also requiring `biometric_liveness`.

**Flow**: capture a selfie with the device's **front-facing** camera (guidance screen → native camera → local preview → Retake before uploading) → the photo uploads through the same Phase 9B evidence flow document-capture uses (`POST .../evidence/uploads` → direct PUT → `POST .../evidence/{evidence}/complete`), with `evidence_type: "selfie"` against the `biometric_liveness` step id → `POST .../face-match-processing` triggers the async comparison → the app polls `GET .../face-match-result` (stopping automatically once the attempt reaches a terminal status) → a normalized, safe result is shown.

**Capture guidance is deliberately non-liveness**: "look directly at the camera," "only one person in frame," "good lighting," "keep your face clear and reasonably close" — never "blink," "turn your head," or "smile" (those belong to a future liveness step, not this one).

**Result semantics** (mirrors the backend's own state machine, never invented client-side):
- `match` → "Face matched," Compliance state refreshes. No retry offered (the step is now resolved; a further trigger would `409`).
- `review` → "Needs review" — the backend routed this to manual review (same `manual_review` mechanism as document review). The app reflects this state and waits; it never converts review to pass/fail locally, and never repeatedly resubmits selfies to try to escape it.
- `no_match` → "We couldn't confirm the match" — a genuinely-run comparison that concluded the faces don't match. This is retryable; a "Retake selfie" action is offered. Never framed with words like "fraud," "fake person," or "identity stolen."
- A technical/capture-quality failure (no verdict at all) maps to safe copy per `failure_reason` — e.g. no face detected, more than one face, face too small/blurry, or the engine being temporarily unavailable. **Probe** (selfie) vs **reference** (document portrait) failures are kept distinct: a reference-side problem (the stored document portrait, not the selfie, was unreadable) never blames or asks for a selfie retake — it points back at the Identity document step instead, since retaking the selfie can't fix it.

**Duplicate submission**: the Submit button is disabled the moment a trigger request is in flight (and a client-side guard additionally prevents a second mutation from starting even if a tap slipped through before the disabled state visually applied) — the backend's own 409 ("already in progress") is still the authoritative backstop, silently recovered from by refreshing the result query rather than shown as an error.

**Provider-aware, server-authoritative**: identical gating pattern to `identity_document` — this flow only appears when `configured_provider === "afilianet"` **and** `provider_actionable === true`, both read directly from the backend. `configured_provider === "incode"` shows its own distinct message; unavailable-but-Afilianet-configured (e.g. the face-match engine isn't operationally enabled) shows a safe "temporarily unavailable" state with manual "Check again," both before capture and if triggering returns `503` after entry was allowed — never an automatic retry loop, never framed as a biometric mismatch.

**Privacy**: no selfie image URI/bytes, evidence id, similarity score, or any face-match engine/model internal is ever sent to analytics or logged — only safe, non-identifying event names (e.g. `face_match_selfie_captured`, `face_match_processing_triggered`). Temporary local captures are deleted after a successful upload; no selfie or face data is persisted to `AsyncStorage` or any local database.

**Current limitations, stated plainly**:
- The identity engine's face-comparison threshold (`FACE_MATCH_COSINE_THRESHOLD`, an OpenCV Zoo SFace reference value) has not been validated against real photos — a documented, known gap on the backend side (see `afilianet-api/docs/identity/FACE_MATCH_INTEGRATION.md`). A synthetic "different identity" fixture pair has measured similarity *above* that threshold, meaning that particular pair can currently report `match` rather than `no_match` through the real engine — this is a backend calibration gap to track, not something this app can or should compensate for client-side.
- Real front-camera selfie capture (actual permission prompts, actual photos) has not been manually verified on a physical device or simulator in this development environment — only the surrounding screens' bundling and the backend contract have been.
- Face Match ≠ Liveness and Face Match ≠ government identity verification, in both senses: this app makes neither claim in its UI copy, and neither capability is implemented — see Phase 9E for the (future) liveness step.

## Project structure

```
src/
  app/            Screens and navigation (Expo Router — file-based routing)
  api/            API client, typed endpoint functions, error handling
  auth/           Sign in/out, session restore, secure token storage
  state/          Organization context (multi-org support)
  services/       Sentry, PostHog analytics, secure storage helpers
  components/     Shared UI: loading/empty/error states, list rows, sheets
  design-system/  Official brand tokens, theme, icons, status→copy mapping
  navigation/     Route path constants and the notification deep-link whitelist
  features/       One folder per business area (affiliate, wallet, sales, ...) —
                   currently placeholders; real screens live under app/ instead
  hooks/          Shared React Query hooks
  types/          TypeScript types matching afilianet-api's API responses
  config/         Environment/config reader
  utils/          Small formatting helpers (money, dates)
```

## Currently implemented MVP screens

- Login, organization selection and switching
- Home dashboard (affiliate status, compliance, recent commissions, wallet, network preview, notification bell)
- Referral link + QR code, with a link into Network's invitation tracking
- Network (sponsor, placement parent, direct sponsored, placement children, invitations) and affiliate drill-down
- Commissions list and detail
- Wallet (balances, activity ledger) and payouts (destinations, eligibility, request, cancel)
- Compliance (case status, required steps, terms acceptance, real `identity_document` document capture and real `face_match` selfie capture — see above; see the simulator note above for the other step types)
- In-app notifications (feed, unread badge, mark read/read-all, whitelisted deep links)
- Profile (identity, affiliate status, compliance access, organization switching, sign out)

## Deferred / not yet integrated

These are known gaps, not implemented in this app version:

- **Incode** (or any real third-party identity/biometric verification provider) — `biometric_liveness` and `verbal_consent` only have Fake test providers server-side; see the simulator note above. Incode's own SDK-driven capture flows for `identity_document`/`face_match` are separate, future integrations — this app's current capture flows are Afilianet-owned only, and never appear when an organization is configured for Incode (enforced via the server-authoritative `configured_provider`/`provider_actionable` gate — see the capture sections above).
- **Liveness / anti-spoofing** (Phase 9E, not yet built) — `face_match` alone never checks liveness; `biometric_liveness` remains simulator-only until that phase.
- **Real, production-validated OCR accuracy** — the pipeline is real (not simulated), but only tested against synthetic images so far; see the capture section above.
- **Real, production-validated face-match threshold calibration** — the pipeline is real, but the comparison threshold is an unvalidated reference default; see the face match capture section above.
- **No typed picker for constrained confirmation fields** (e.g. passport `sex`, which the backend requires as exactly `M`/`F`/`X`) — the confirmation form renders every confirmable field as a plain text input with a short format hint; an invalid value surfaces as a normal field-level validation error rather than being prevented up front by a picker/select control.
- **Push notifications** — the in-app notification inbox and unread badge are real; device push (APNs/FCM) isn't wired up.
- **A real payout provider** — payout destinations are self-attested labels only (never a verified bank/card link), and payouts don't move real money.
- **Terms of Service versioning** — there's no published, versioned terms document yet; the terms-acceptance step records a provisional acceptance and is explicit with the user that formal terms haven't been published.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the app (development) |
| `npm run start:staging` | Start against the staging environment |
| `npm run start:production` | Start against the production environment |
| `npm run typecheck` | Check for TypeScript errors |
| `npm run lint` | Check code style/quality issues |
| `npm test` | Run the automated tests |

## Security notes

- The sign-in token is stored using the phone's secure keychain/keystore (`expo-secure-store`) — never in plain storage.
- Passwords, tokens, and compliance/payout details are never written to logs.

## Error tracking & analytics (Sentry / PostHog)

Both are wired up but **disabled by default**. To enable:

- Sentry: set `EXPO_PUBLIC_SENTRY_DSN` in your `.env` file to your project's DSN.
- PostHog: set `EXPO_PUBLIC_POSTHOG_API_KEY` (and `EXPO_PUBLIC_POSTHOG_HOST` if you're not using PostHog Cloud US).

Leaving these blank is safe — the app runs normally, it just doesn't send any data anywhere.
