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

When you're done with a throwaway account, delete its organization (cascades every domain row it owns) and the user itself:

```php
Organization::find($org->id)->delete();
User::find($user->id)->delete();
```

## The compliance verification simulator

The five identity/biometric compliance step types (`identity_document`, `biometric_liveness`, `face_match`, `verbal_consent`, and read-only `identity_information`) have no real verification provider behind them yet — afilianet-api only implements Fake/test providers for these. To exercise them in development, the app shows an additional **development-only pass/fail simulator** on each of those steps, gated by `isDevelopmentSimulatorEnabled` in `src/config/env.ts` (`__DEV__ && EXPO_PUBLIC_APP_ENV=development` — both conditions, so it can never appear in a release build regardless of how one is misconfigured). Only `terms_acceptance` has a real, user-submittable production path today.

**This simulator must never be reachable outside local development.** Don't set `EXPO_PUBLIC_APP_ENV=development` in a staging or production environment file.

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
- Compliance (case status, required steps, terms acceptance; see the simulator note above for the other step types)
- In-app notifications (feed, unread badge, mark read/read-all, whitelisted deep links)
- Profile (identity, affiliate status, compliance access, organization switching, sign out)

## Deferred / not yet integrated

These are known gaps, not implemented in this app version:

- **Incode** (or any real identity/biometric verification provider) — `identity_document`, `biometric_liveness`, `face_match`, and `verbal_consent` only have Fake test providers server-side; see the simulator note above.
- **S3 (or any) evidence storage** — there's nowhere to upload verification evidence to yet, which is part of why the steps above have no real submission path.
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
