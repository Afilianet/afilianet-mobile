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

Then, in a separate terminal, start the backend so it's reachable over the network (not just from the same machine's `php artisan serve` default of `localhost`-only):

```bash
cd ../afilianet-api
php artisan serve --host=0.0.0.0 --port=8000
```

Leave that running. `.env`'s default (`http://127.0.0.1:8000`) works as-is from the iOS Simulator. You may need to change `EXPO_PUBLIC_API_BASE_URL` depending on how you're running the app — see "Changing the API URL" below.

> **Note on Laravel Herd:** this machine has Herd installed, but `afilianet-api` isn't currently linked to a working `.test` domain (only the parent `Afilianet` folder is parked, as `afilianet.test`, which isn't the same thing) — and the Herd service wasn't running when this was checked. If you'd rather use Herd than `artisan serve`, run `herd link` from inside the `afilianet-api` folder, make sure the Herd app is running, then use `http://afilianet-api.test` instead.

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

All of these assume `php artisan serve --host=0.0.0.0 --port=8000` is running in `afilianet-api` (see above).

| How you're running the app | Value to use | Why |
| --- | --- | --- |
| iOS Simulator | `http://127.0.0.1:8000` (the default) | The simulator shares your computer's network, so `localhost`/`127.0.0.1` reaches it directly. |
| Android Emulator | `http://10.0.2.2:8000` | The emulator has its own virtual network and can't resolve `localhost` or `127.0.0.1` as "the host machine." `10.0.2.2` is Android's built-in alias for that. |
| Physical phone (iPhone or Android) | `http://<your-computer's-LAN-IP>:8000` | Another device on your Wi-Fi can't reach `127.0.0.1` or `10.0.2.2` at all — those only resolve to "this same device." Find your computer's LAN IP address (Windows: run `ipconfig` and look for "IPv4 Address") and use that instead. |

If you have Laravel Herd running with `afilianet-api` linked (see the note above), you can use `http://afilianet-api.test` in place of `http://127.0.0.1:8000` on the iOS Simulator row only — Android Emulator and physical phones still need `10.0.2.2` / your LAN IP, since `.test` domains only resolve on the host machine itself.

After changing `.env`, stop and restart `npm start` (Expo only reads `.env` at startup).

## Switching between development, staging, and production

This app supports three environments, each with its own settings file:

- `.env` — used by `npm start` (development, edited by you locally)
- `.env.staging` — used by `npm run start:staging`
- `.env.production` — used by `npm run start:production`

`.env.staging` and `.env.production` don't exist until you create them — copy `.env.staging.example` / `.env.production.example` and fill in the real staging/production API URLs (and Sentry/PostHog keys, once you have them). These files are intentionally left out of git (see `.gitignore`) since they may eventually hold real credentials — never commit them.

## Signing in during development

Use any real account's email and password. If you need a throwaway account to test with, create one from the `afilianet-api` folder:

```bash
php artisan tinker
```

```php
$user = new \App\Modules\Users\Models\User();
$user->uuid = (string) \Illuminate\Support\Str::uuid();
$user->first_name = 'Test';
$user->last_name = 'User';
$user->email = 'test@example.com';
$user->password = \Illuminate\Support\Facades\Hash::make('Password123!');
$user->status = \App\Modules\Users\Enums\UserStatus::Active;
$user->save();
```

Both `active` and `pending` accounts can sign in; `suspended` and `blocked` accounts get a clear error instead.

## Project structure

```
src/
  app/            Screens and navigation (Expo Router — file-based routing)
  api/            API client, typed endpoint functions, error handling
  auth/           Sign in/out, session restore, secure token storage
  state/          Organization context (multi-org support)
  services/       Sentry, PostHog analytics, secure storage helpers
  components/     Shared UI: design system (ui/) + loading/empty/error states
  features/       One folder per business area (affiliate, wallet, sales, ...) —
                   currently placeholders, filled in as each area gets built
  hooks/          Shared React Query hooks
  types/          TypeScript types matching afilianet-api's API responses
  config/         Environment/config reader
  utils/          Small formatting helpers (money, dates)
```

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
