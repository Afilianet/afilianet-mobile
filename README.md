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

## Environments

This app supports four environments, each with its own settings file:

| Environment | Settings file | Run with | Purpose |
| --- | --- | --- | --- |
| `development` | `.env` | `npm start` | Local development against a Docker backend you control. |
| `internal` | `.env.internal` | `npm run start:internal` | Internal Alpha — a real backend, real providers, handed to a non-programmer for real device testing. |
| `staging` | `.env.staging` | `npm run start:staging` | A shared pre-production backend, once one exists. |
| `production` | `.env.production` | `npm run start:production` | The real, live backend. |

`.env.internal`, `.env.staging`, and `.env.production` don't exist until you create them — copy the matching `.example` file (`.env.internal.example` / `.env.staging.example` / `.env.production.example`) and fill in real values. These files are intentionally left out of git (see `.gitignore`) — never commit them, even though the values in this app happen not to be secrets (see below).

Each environment file sets the same four things:

- **`EXPO_PUBLIC_API_BASE_URL`** — which backend this build talks to. Never edited automatically between environments; a build only uses whatever its own environment file says, so a `staging`/`internal` build can never silently point at production.
- **`EXPO_PUBLIC_APP_ENV`** — this build's own identifier (`"development"` / `"internal"` / `"staging"` / `"production"`), read in `src/config/env.ts`. This is the single signal that gates the development-only Compliance simulator (see below) and tags Sentry error reports by environment, so an Internal Alpha crash is never confused with a real production one.
- **`EXPO_PUBLIC_SENTRY_DSN`** / **`EXPO_PUBLIC_POSTHOG_API_KEY`** — see "Error tracking & analytics" below; both no-op when blank.

**Every `EXPO_PUBLIC_*` variable is bundled into the client and visible to anyone who inspects the app** — that's how Expo's public env vars work, and it's why this app never puts a real secret in one. A Sentry DSN and a PostHog project API key are both designed to be public/write-only values (this is normal, documented practice for both services), not secrets in the traditional sense. `afilianet-api`'s own server-side credentials (database passwords, the identity-engine service token, etc.) never appear anywhere in this repo or this app's bundle.

**Development-only tooling** (`isDevelopmentSimulatorEnabled` in `src/config/env.ts`) requires BOTH `__DEV__` (a build-time constant, compiled out of every release/EAS build regardless of environment) AND `EXPO_PUBLIC_APP_ENV=development` — so it is structurally impossible in an `internal`, `staging`, or `production` build, even if an environment file were misconfigured. Internal Alpha always exercises real backend/provider behavior, never the Fake-provider simulator.

## Internal Alpha — getting Afilianet onto a physical phone

There are two paths, in order of how fast they get an installable/usable app onto a real device.

### Fastest path: Expo Go (no build, no store, no account needed)

This works **today**, with nothing to install beyond the free Expo Go app, and is the fastest way to get Afilianet in front of a product owner on a real phone:

1. Make sure the `afilianet-api` Docker stack is running on a machine reachable from the phone's Wi-Fi network (see "Set up your environment file" above).
2. Find that machine's LAN IP (Windows: `ipconfig`, look for "IPv4 Address").
3. `cp .env.internal.example .env.internal` (PowerShell: `Copy-Item .env.internal.example .env.internal`), then set `EXPO_PUBLIC_API_BASE_URL=http://<that-LAN-IP>:8000`.
4. `npm run start:internal`, then scan the QR code with **Expo Go** (iOS App Store / Android Play Store) on the phone, same Wi-Fi network as the Docker host.

This is a real `internal`-environment run (real backend, real providers, no dev simulator) — it just isn't a standalone installable app; Expo Go has to stay installed and the phone has to stay on the same network as the backend, and the app disappears from Expo Go once you close it (no home-screen icon of its own). For that, use an EAS build instead.

### Standalone installable app: EAS Build

[EAS Build](https://docs.expo.dev/build/introduction/) compiles a real native binary in the cloud — an APK you can hand someone to sideload, or (once Apple prerequisites exist) a TestFlight build. `eas.json` in this repo already defines three build profiles:

| Profile | Produces | Distribution | Use for |
| --- | --- | --- | --- |
| `development` | Android APK / iOS simulator build | internal | A native dev build, if `expo start`'s Expo-Go-based flow above is ever insufficient (no custom native module currently requires this). |
| `internal` | Android APK | internal (direct install/sideload) | **Internal Alpha** — this is the one to use. |
| `production` | Android App Bundle (`.aab`) | store submission | The real Play Store / App Store release, later. |

**Before running an `internal` or `development` build**, set a real, reachable `EXPO_PUBLIC_API_BASE_URL` — `eas.json` deliberately leaves it unset for those two profiles (a cloud build has no access to your local `.env.internal`, and guessing a URL here risks silently baking in a stale one). Edit `eas.json`'s `build.internal.env.EXPO_PUBLIC_API_BASE_URL` directly, or run `eas env:create` to set it as a proper EAS environment variable — either way, use the same kind of reachable URL described above (a real staging deployment, or a LAN IP if the tester's phone and the Docker host are on the same network).

**Setup, one-time** (needs a free or paid [Expo/EAS account](https://expo.dev/signup) — this repo has no EAS project configured yet):

```bash
npx eas-cli login          # opens a browser to sign in / create an account
npx eas-cli build:configure  # links this repo to an EAS project (writes extra.eas.projectId into app.json)
```

**Android internal build** (the priority path — no Apple account needed):

```bash
npx eas-cli build --platform android --profile internal
```

This uploads the project, builds in the cloud, and prints a download link (and a QR code) for the resulting `.apk` when done — typically several minutes. Download it to the phone and open it to install (Android will ask to allow installs from this source the first time; that's expected for a non-Play-Store APK).

**iOS internal build** — see "iOS readiness" below; it needs a paid Apple Developer account before any command here will succeed.

```bash
npx eas-cli build --platform ios --profile internal
```

### iOS readiness

An iOS build (simulator or device) requires, in order:

1. An [Apple Developer Program](https://developer.apple.com/programs/) membership (paid, $99/year) under whichever Apple ID will own this app.
2. Running `npx eas-cli build --platform ios --profile internal` while logged into both EAS and (when prompted) that Apple ID — `eas build` handles certificate/provisioning-profile creation automatically via `eas credentials` the first time.
3. For a **real device** (not the simulator): the device's UDID must be registered to that Apple Developer account first (`npx eas-cli device:create` walks through this) — Apple requires every ad-hoc/internal-distribution device to be explicitly registered.
4. For **TestFlight** instead of a direct install: an App Store Connect app record under that account, then `npx eas-cli submit --platform ios --profile production` (or an ad-hoc internal build via step 2 for a non-TestFlight direct install).

None of this is a code problem — it's entirely Apple account/credential state, external to this repo.

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
- **A hosted `internal`/`staging` backend** — Internal Alpha's own environment file needs a real, reachable `EXPO_PUBLIC_API_BASE_URL`; today that means a LAN IP pointing at someone's Docker instance (see "Internal Alpha" above), not a stable, always-on URL. A real deployed backend for this purpose doesn't exist yet.
- **A few Expo SDK packages are a patch version or two behind** what SDK 57's latest release expects (`npx expo-doctor` flags ~15 patch-level mismatches, e.g. `expo` 57.0.15 vs. the 57.0.19 the tooling currently recommends) — not treated as a build blocker (patch-level, and a same-day `npm install` attempt to align them hit an unrelated `npm` peer-dependency resolution conflict in this environment), but worth a dedicated `npx expo install --check` pass before a wider release.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the app (development) |
| `npm run start:internal` | Start against the Internal Alpha environment (Expo Go path — see above) |
| `npm run start:staging` | Start against the staging environment |
| `npm run start:production` | Start against the production environment |
| `npm run typecheck` | Check for TypeScript errors |
| `npm run lint` | Check code style/quality issues |
| `npm test` | Run the automated tests |
| `npx eas-cli login` | Sign in to your Expo/EAS account (one-time) |
| `npx eas-cli build:configure` | Link this repo to an EAS project (one-time) |
| `npx eas-cli build --platform android --profile internal` | Build the Internal Alpha Android APK |
| `npx eas-cli build --platform ios --profile internal` | Build the Internal Alpha iOS app (needs an Apple Developer account — see "iOS readiness") |

## App identifiers & branding

- **Android `applicationId`**: `com.afilianet.mobile` (`app.json`'s `expo.android.package`).
- **iOS `bundleIdentifier`**: `com.afilianet.mobile` (`app.json`'s `expo.ios.bundleIdentifier`).

Neither existed before Internal Alpha — both were newly established this phase (there was no prior convention anywhere in this repo to preserve). Both are safe to change now, before any EAS credentials or App Store Connect / Play Console record exists for them, but **not after** — an `applicationId`/`bundleIdentifier` is effectively permanent once a store listing or set of signing credentials is created against it. If Afilianet's team wants a different identifier, change it now.

- **App icon**: `assets/brand/afilianet-app-icon-1024.png` (real brand asset, not the Expo default) — used for the top-level icon (both platforms) and, combined with `assets/brand/android-adaptive-*-432.png`, the Android adaptive icon.
- **Splash screen**: the same icon mark, centered on the brand's dark background color (`#0C0A14`) via the standard `expo-splash-screen` plugin — no separate splash image (see `src/design-system/README.md` for why: the handoff's splash assets were full-bleed, per-resolution images incompatible with Expo's managed splash, which only supports one centered image over a solid color).
- **Display name**: "Afilianet" (`app.json`'s `expo.name`) — this is what shows under the icon on the device home screen and as the app's title.
- `assets/images/` still has several unused files left over from the original Expo template scaffold (`expo-logo.png`, `react-logo*.png`, `icon.png`, `android-icon-*.png`, `splash-icon.png`, `tutorial-web.png`) — none of them are referenced by `app.json` or any screen, so they never render anywhere; they're just repo clutter. Left alone this phase (a cleanup, not a build-readiness fix), but worth deleting in a future pass.
- No further branding assets are required for Internal Alpha to look correct — everything the app currently displays already uses the real brand.

## Security notes

- The sign-in token is stored using the phone's secure keychain/keystore (`expo-secure-store`) — never in plain storage.
- Passwords, tokens, and compliance/payout details are never written to logs.

## Error tracking & analytics (Sentry / PostHog)

Both are wired up but **disabled by default**. To enable:

- Sentry: set `EXPO_PUBLIC_SENTRY_DSN` in your `.env` file to your project's DSN.
- PostHog: set `EXPO_PUBLIC_POSTHOG_API_KEY` (and `EXPO_PUBLIC_POSTHOG_HOST` if you're not using PostHog Cloud US).

Leaving these blank is safe — the app runs normally, it just doesn't send any data anywhere.

## Physical-device QA checklist

A concise manual pass for anyone installing Afilianet on a real phone for the first time (whether via Expo Go or an EAS-built app). Check each item works and looks right; nothing here is automated.

- [ ] **Install** — app installs without a manual "trust this developer" step blocking it entirely (Android's "install from unknown sources" prompt on an APK is expected and fine).
- [ ] **Launch** — cold launch shows the splash screen (brand mark on dark background) then the login screen, no white screen, no crash.
- [ ] **Login** — sign in with a real account; a wrong password shows a clear error, not a crash.
- [ ] **Org switch** — if the account belongs to more than one organization, the organization picker appears and switching organizations updates Home/Compliance/etc. without stale data from the previous org.
- [ ] **Home** — affiliate status, compliance summary, recent commissions, wallet preview, network preview, and the notification bell all render.
- [ ] **Referral** — the referral screen loads, shows a QR code and copyable link, and Share opens the device's real share sheet.
- [ ] **Network** — sponsor/placement/sponsored/invitations lists load; tapping into an affiliate shows their drill-down.
- [ ] **Commissions** — list and a detail view both load.
- [ ] **Wallet** — balances and activity ledger load.
- [ ] **Payouts** — destinations, eligibility, and (if eligible) requesting/cancelling a payout all work.
- [ ] **Compliance** — case status and required steps render for the signed-in account's organization.
- [ ] **Document capture** — camera permission prompt appears with clear copy; capturing an identity-document photo (front/back or identity page, per document type) shows a local preview with Retake before uploading; upload completes and processing/result state shows correctly. **This must be tested with the real device camera, not a simulator/emulator's fake camera feed if avoidable.**
- [ ] **Selfie capture** — camera opens front-facing by default; capture → preview → retake/use → upload → result behaves the same as document capture. **Same real-camera note as above.**
- [ ] **Notifications** — the in-app notification list loads, unread badge reflects real state, marking read/read-all works, tapping a notification navigates to its whitelisted destination.
- [ ] **Profile** — identity, affiliate status, compliance access, and organization switching are all reachable from Profile.
- [ ] **Logout/login** — signing out returns to the login screen; signing back in restores the same account state cleanly (no leftover data from the previous session).
- [ ] **Backgrounding** — send the app to the background and back; it resumes without crashing or losing the current screen.
- [ ] **Airplane mode** — toggling airplane mode on mid-session shows a clear error/retry state somewhere (not a silent hang), and turning it back off lets the app recover without a restart.
