# Acceso MVP: correo o celular, registro directo y afiliación posterior

Este documento describe cómo funciona en Mobile el acceso con correo o celular y qué partes dependen todavía de afilianet-api.

## Qué hace Mobile

- **Registro directo** (`/(auth)/register`): nombre, correo, celular o ambos (al menos uno) y contraseña. No pide referido ni organización.
  - El celular se elige con un selector de país y se envía siempre en E.164 (`utils/phone.ts`). México es `+52` seguido de 10 dígitos; Mobile quita los prefijos `044`, `045` y `1`.
- **Registro con invitación** (`/(auth)/invitation` y `/join/{organización}/{código}`): el mismo formulario acepta correo, celular o ambos.
- **Verificación** (`/verify-account`):
  - Correo: enlace por correo, con espera de reenvío y el botón "Ya confirmé mi correo", que vuelve a leer el usuario.
  - Celular: código por SMS con reenvío y cuenta regresiva. Los errores de código vencido, código inválido y demasiados intentos se muestran en español.
  - "Verificado" solo aparece cuando `email_verified_at` o `phone_verified_at` del servidor lo indican. El cliente nunca marca un canal como verificado.
- **Login** con correo o celular, más contraseña.
- **Recuperación**:
  - por correo, con un enlace;
  - por celular, con un código SMS y la contraseña nueva en la misma pantalla. Funciona también para cuentas que solo tienen celular.
- **Usuario independiente** (sin organización, `/no-organization`):
  - acceso a su perfil, a la configuración y a las notificaciones de Afilianet;
  - aviso para verificar sus datos si el servidor reporta alguno pendiente;
  - buscador de invitaciones para incorporarse después con la misma cuenta.
  - No se llama a ningún endpoint que requiera una organización.
- **Afiliación posterior**: un usuario con sesión que abre `/join/...` confirma con "Unirme con mi cuenta". Mobile usa el `accept` autenticado del API, que no crea otra cuenta.
- **Referido conservado** (`auth/pendingReferral.ts`):
  - Al abrir un enlace sin sesión, el referido queda guardado. Sobrevive al registro, la verificación, el login y un reinicio de la app.
  - Después se ofrece confirmarlo con la cuenta que se usó.
  - Se borra al aceptarlo, al descartarlo, a los 7 días o al cerrar sesión, para que nunca pase a otra cuenta.

## Contrato con afilianet-api

**Existe hoy** (`feat/platform-users-notifications` @ `53b1086`):
- `POST /api/v1/auth/login` con `{email, password}`.
- `POST /api/v1/auth/forgot-password` con `{email}`.
- `POST /api/v1/auth/email-verification`.
- `POST /api/v1/invitations/{token}/accept`:
  - sin sesión: registro con `email` y/o `phone`;
  - con sesión: afiliación con la cuenta actual (`token: null`).

**Propuesto y pendiente en API.** Está aislado en `src/api/access.ts`. Mientras no exista, el API responde 404 o 405 y Mobile muestra "Esta opción todavía no está disponible".
- `POST /api/v1/auth/register`: `{first_name, last_name, email?, phone?, password, password_confirmation}` → `201 {token, user}`.
- `POST /api/v1/auth/phone-verification` (con sesión) → `202 {data: {retry_after, expires_in}}`.
- `POST /api/v1/auth/verify-phone` (con sesión): `{code}` → `{data: {user}}`.
- `POST /api/v1/auth/login` con `{phone, password}`.
- `POST /api/v1/auth/forgot-password` con `{phone}` → `{message, retry_after}`.
- `POST /api/v1/auth/reset-password` con `{phone, code, password, password_confirmation}`.

Convenciones que Mobile necesita del API:
- `reason` en las respuestas 422 y 429. Valores: `otp_invalid`, `otp_expired`, `otp_attempts_exceeded`, `phone_missing`, `phone_already_verified`.
- `retry_after` en segundos en las respuestas 202 y 429. Mobile también lee el header `Retry-After`.
- `UserResource.email` puede ser `null` en cuentas que solo tienen celular.

## Pruebas físicas

Usar el development-staging APK con Metro. Todo es JavaScript: no requiere un APK nuevo.

Deep link a una invitación: `adb shell am start -W -a android.intent.action.VIEW -d "afilianetmobile://join/<organizationId>/<code>" com.afilianet.mobile`.

El enlace HTTPS de staging (`https://staging-admin.afilianet.mx/join/...`) abre la web: la app no tiene App Links configurados.
