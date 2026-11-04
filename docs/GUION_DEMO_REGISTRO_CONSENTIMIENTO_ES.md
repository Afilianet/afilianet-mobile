# Guion de la demo: registro, activación y consentimiento (lunes 9 de noviembre de 2026)

**Combinación confirmada por Andrés:** Mobile #88 (contiene #87) + API #119 (#115 + #118). #87 queda intacto como
referencia.

**Estado:** preparado y validado con pruebas y datos sintéticos. **No autorizado todavía:** merge, build o APK,
despliegue, publicación del aviso ni llamadas reales. Este guion no se ejecuta hasta que Andrés autorice cada paso.

## 1. Candidatos

| | PR | Head | CI |
|---|---|---|---|
| Mobile | #88 `feat/registration-consents` (base: rama de #87) | ver el PR (este documento va en él) | `workflow_dispatch` en verde. Jest completo en local |
| Mobile, referencia | #87 `integration/kyc-mobile-candidate` | `19cdea6ad1990ccd6332e98e734de9fe0c1815db` | 41571803921 |
| API, candidato único de la demo | #125 (#119 + territorial) | `b7f0f616223ff47f3bc4966a37c6b30e98bdb867` | 41771632788 |
| API | #119 `integration/demo-2026-11-09` | `677cbc0f669c2507c88ead62a1d359ab2df47ef5` (aviso aprobado en el archivo, `dc77fd9`) | — |
| API, parte | #115 `integration/kyc-candidate` | `41273923fbffdcfc47d4f5642267556bf0312f7c` | 41701231593 |
| API, parte | #118 `feat/registration-consents` | `8bcaa45a78bf1f4f0015febdb7bbd496f911623e` (contrato de `4bf8398`, sin cambios de forma) | 41759457661 |
| API, parte | #121 (encuestas: sin análisis de calidad encolado en staging) | `a3ea4ac871938d66c6598506a33c681069adc39c` | 41759141089 |

- **#119 @ `66060a1`:** el árbol es idéntico al merge automático de #115 y #118. El head nuevo añade:
  - #121: `quality_analysis.status` puede valer `not_scheduled`. Mobile no lee ese campo;
  - el borrador del aviso con la asignación y el conteo territorial: secciones 2 y 3 y aviso simplificado, sin finalidad
    ni casilla nueva. Los textos de las casillas y sus `text_sha256` no cambian; el sha256 del documento sí, así que la
    app siempre lo toma de la API.
- **Contrato de consentimientos:** los ejemplos de API (`docs/privacy/examples/consents/`) no cambian entre `4bf8398` y
  `66060a1`. Se sirven tal cual en `src/tests/app/registration-consents-contract.test.tsx`.
- **Aviso real:** API generó en `66060a1` respuestas con el aviso real `2026-11-03-general.2`, aprobado solo dentro de
  su prueba; el archivo del repositorio sigue pendiente. Esas respuestas se sirven en
  `src/tests/app/registration-consents-real-notice.test.tsx`:
  - aviso, registro, mi privacidad, autorización y su reintento, y consulta de liga con `verification_expected`;
  - el `text_sha256` de cada finalidad (no cambia con el head nuevo de #119).
  - Ojo: el aviso simplificado de esas respuestas es el anterior al añadido territorial.
  - El sha256 del documento de esas respuestas es de la copia de prueba y cambiará al aprobarlo: la app siempre lo toma
    de la API.
- **Contrato KYC:** #87 se validó contra #115 @ `29dc5a1`. Lo que #115 añadió después no cambia ninguna respuesta
  HTTP; solo añade el interruptor `IDENTITY_DOCUMENT_TECHNICAL_RETRIES_ENABLED`. Si está apagado, el reintento del
  documento responde 409 `document_retry_not_available`, que la app ya explica.

## 2. Lo que falta aprobar o configurar para ver las casillas

Con la configuración por defecto, los consentimientos están apagados y esta parte de la demo **no queda cubierta**: no
aparece ninguna casilla de finalidad y la puerta del KYC no actúa.

**Texto: `resources/privacy/notices/2026-11-03-general.2.json`** (API #119)
- Versión `2026-11-03.general.2`, con 8 secciones, 2 finalidades y el aviso simplificado.
- `classification.status` es `"pending_approval"`, y `approved_by` y `approved_at` son `null`. El cargador no sirve
  un aviso sin aprobar.
- Para publicarlo, alguien con autoridad tiene que aprobarlo:
  - `status: "approved"`;
  - `approved_by`: un rol, no un nombre, porque se sirve en público (pendiente P7);
  - `approved_at`.
- Casilla 2, `identity_verification` (`required_for: ["kyc"]`): «Autorizo expresamente el tratamiento de mis
  documentos de identidad y datos biométricos para verificar mi identidad, realizar la prueba de vida y la comparación
  facial, y revisar mi caso, conforme al Aviso de privacidad.»
- Casilla 3, `quality_testing` (`required_for: []`): «Autorizo voluntariamente el uso de las imágenes de documentos
  que aporte para pruebas de lectura y recorte, incluidos los datos sensibles que contengan, conforme a la sección
  “Pruebas de calidad” del Aviso de privacidad.»
- Las instrucciones internas están en `docs/privacy/AVISO_GENERAL_2026-11-03_INTERNO.md` y nunca se sirven ni se
  muestran en la app.

**Configuración del API del entorno de la demo**
- **Estado (API, 2026-11-04):** `dc77fd9` solo aprueba el aviso en el archivo. Andrés autorizó
  `PRIVACY_NOTICE_PUBLISHED=true` y `PRIVACY_NOTICE_DOCUMENT=2026-11-03-general.2` en staging, con Infra como único
  ejecutor y una vez desplegada la versión compatible (#125). No consta que estén aplicadas.
- `PRIVACY_NOTICE_PUBLISHED=true`.
- `PRIVACY_NOTICE_DOCUMENT=2026-11-03-general.2`.
- `PRIVACY_CONSENT_HOLDER_VERIFICATION` (por omisión `email_or_phone`; pendiente P4): qué verificación de la cuenta
  hace falta para que la autorización cuente.
- **Sin configurar:** `PLATFORM_TERMS_DOCUMENT` y `PLATFORM_TERMS_REQUIRED`. No hay términos generales aprobados
  (P1). La casilla 1 solo registra la constancia del aviso y `/legal/terms` responde 503. Mobile no lo llama.
- La organización de la demo debe tener la captura de KYC habilitada. Solo así el bloque `privacy` trae
  `verification_expected: true` y aparece la casilla 2 al unirse por liga.

**Efectos de publicarlo** (decide Andrés dónde)
- Activa la puerta `kyc.consent` en **todas** las cuentas y casos de ese entorno, no solo en la demo. Ninguna
  escritura en `/compliance/*` funciona sin la autorización vigente del titular.
- Incluye tu caso en staging, si la demo se hace ahí: tu próxima captura pediría la autorización.
- Las cuentas existentes verán el aviso nuevo como «Revisión requerida» en Avisos de privacidad. Solo bloquea si
  `PRIVACY_NOTICE_ENFORCE_REVIEW=true`.
- Alternativa sin efectos en staging: un entorno aislado (como el de la prueba física de avisos) con #119 y el aviso
  aprobado solo ahí.

**Envíos reales** (decide Andrés)
- Con `PRIVACY_CONSENT_HOLDER_VERIFICATION=email_or_phone`, una cuenta creada en el teléfono debe verificar su correo o
  su celular antes de que su autorización habilite el KYC. Eso **envía un correo o un SMS real**.
- La activación asistida en Mobile («¿Olvidaste tu contraseña?», A3) también envía uno.
- Sin autorización para envíos reales, los escenarios C1, A3–A5 y la verificación de R5–R6 no se pueden completar en
  vivo; quedan cubiertos solo por pruebas.
- La alternativa es decidir P4 de otra forma, por ejemplo sin exigir la verificación del titular en el entorno de la
  demo. Esa decisión es de Andrés.

**Mobile**
- Necesita un APK de #88. No está construido ni autorizado: es otro build y otro versionCode, a decidir.
- Ese APK debe apuntar al API del entorno donde se publique el aviso.

## 3. Datos para la demo
- Cuentas y contactos de prueba propios. Nunca datos de personas reales que no participen.
- Evidencias: capturas de pantalla y la respuesta de `GET /me/privacy`. Sin tokens, contraseñas ni imágenes de
  identificaciones.

## 4. Escenarios

### R. Registro
| # | Pasos | Esperado |
|---|---|---|
| R1 | Abrir «Crear cuenta» sin invitación | Aviso simplificado junto al formulario; casilla 1 sin marcar; casilla 3 «Opcional» sin marcar; **sin** casilla 2 (no hay organización) |
| R2 | «Ver aviso completo» antes de marcar nada | Se abre el aviso íntegro de esa versión; nada se marca solo |
| R3 | Llenar, marcar solo la casilla 1, «Crear cuenta» | Se crea la cuenta. En la pantalla siguiente no hay constancia de autorizaciones (no se envió ninguna) |
| R4 | Igual, marcando también la 3 | Pantalla siguiente: «Registrada: Pruebas de calidad (opcional)», **solo** si la API la devolvió como guardada |
| R5 | Abrir una liga de referido de la organización con KYC | Aparecen las casillas 2 y 3, sin marcar. La 2 explica que no es el permiso de la cámara |
| R6 | Crear la cuenta por liga sin marcar la 2 | Se crea la cuenta; la autorización se pedirá al empezar la verificación |

### A. Alta asistida y activación
| # | Pasos | Esperado |
|---|---|---|
| A1 | El patrocinador registra a una persona («Registrar a alguien») | Sin casillas de finalidad; solo la confirmación de que la persona autorizó el registro, que sigue siendo otra cosa |
| A2 | El patrocinador intenta empezar la verificación por ella | Mensaje: «La persona todavía no autoriza la verificación de identidad desde su propia cuenta. Solo ella puede hacerlo.» No se crea nada. El patrocinador no ve su propia autorización en el caso de otra persona |
| A3 | La persona abre el enlace de activación de su correo (página `/activate`), activa su cuenta y luego inicia sesión en la app | Entra con su propia sesión. El enlace verifica su correo. **Es un correo real**, que se encola solo al crear el alta, sin reenvío: el correo de la API debe estar activo antes de A1 |
| A4 | La persona abre Verificación | Ve la autorización con el texto del aviso y la casilla sin marcar. Si su correo o celular no está verificado, primero se le pide confirmarlo |
| A5 | Marca y pulsa «Registrar autorización» | «Comenzar verificación» se habilita solo cuando la API la devuelve como efectiva |

El enlace de activación por correo lleva a la página `/activate` de Admin, que no envía `consents` aunque la API los
admita. La autorización de verificación de identidad se obtiene siempre después, en la app, en A4 y A5.

**Con la puerta activa, el patrocinador no puede capturar por la persona (P5):**
- antes de que ella decida, la API responde 403 `consent_required` (`assisted_person`);
- después de que active su cuenta, responde 409 `assisted_access_claimed` («la persona ya activó su cuenta»).

En la demo, el alta asistida termina así: **la persona activa su cuenta y hace ella misma su verificación.**

### P. Primer afiliado (antes de la ronda de correo)
Una organización recién creada no tiene afiliados ni código de referido. La cuenta de prueba existente del primer afiliado
acepta en la web la invitación manual de la organización (Admin #72); la app no acepta ese token.

| # | Pasos | Esperado |
|---|---|---|
| P1 | Después de aceptar en la web: **cerrar y volver a abrir la app** (o cerrar sesión y volver a entrar) | La app carga la lista de organizaciones solo al iniciar sesión o al abrirse con la sesión guardada. Aceptar fuera de la app no la actualiza sola, y deslizar en Inicio no la recarga |
| P2 | Si es su única organización | Queda como organización activa automáticamente. Si ya tenía otra activa, sigue esa: cambiar en el selector de «Organización activa» |
| P3 | Inicio con la organización de la demo activa | Su perfil de afiliado con estado «Pendiente» y el botón «Compartir liga de referido» |
| P4 | «Compartir liga de referido» (o Mi red → invitar) | «Tu código de afiliado» con el código. «Tu cuenta sigue en revisión, pero tu liga de referido ya funciona.» «Liga de referido» `https://staging-admin.afilianet.mx/join/{organización}/{código}`, con QR, «Compartir», «Copiar liga», «Compartir por WhatsApp» e «Invitar por correo» |

Cubierto por pruebas existentes: la organización única queda seleccionada sola (`OrganizationProvider.test.tsx`), y un
afiliado pendiente ve su liga y el aviso de revisión (`referral.test.tsx`, «Referral: pending affiliate»). Solo en el
teléfono: que la invitación aceptada en la web aparezca tras reabrir la app.

### V. Regreso desde los correos
| # | Pasos | Esperado |
|---|---|---|
| V1 | Registro por referido → correo de verificación → `/verify-email` → «Abrir Afilianet» (`afilianetmobile://profile`) | La app abre Perfil. La tarjeta del correo se vuelve a leer al enfocar Perfil y al volver la app a primer plano, y pasa a «Correo confirmado» |
| V2 | Después de V1, Verificación | La autorización se vuelve a pedir al servidor siempre que se abre Verificación (y al deslizar para refrescar), así que ya no pide confirmar el correo: muestra la casilla o reutiliza la autorización |
| V3 | Alta asistida → `/activate` (activar la cuenta y crear la contraseña) → «inicia sesión en la app» → Verificación | Tras activar e iniciar sesión, la app pide la autorización con el texto del aviso antes de la primera captura. `/activate` **no** registra la autorización: Admin no envía `consents` y su BFF los filtra |

**Correos durante la ronda (paso 9):** API abre solo dos tipos de correo a cualquier participante, sin lista previa
(`EMAIL_OPEN_ACTIONS`, API #125 @ `cfdde0b`): la verificación del registro y el enlace de activación del alta asistida.
El restablecimiento de contraseña y las invitaciones de personal siguen limitados a la lista. No hay SMS ni campañas.
Se apaga al terminar la ronda.

**Capturas KYC reales: límite operativo del ensayo.** Solo las dos cuentas `+demo1` de Andrés hacen capturas reales,
con su titular y su autorización registrada: una para el registro por referido (V1–V2) y otra para el alta asistida
(V3). El resto de participantes puede registrarse, verificar su correo y responder encuestas, pero **no** debe iniciar
la verificación. **Esto no es un bloqueo técnico:** la app permite iniciar la verificación a cualquier cuenta con
correo verificado y la autorización registrada. El límite lo aplica quien conduce el ensayo. Las direcciones están en
el paquete de API, no en este repositorio.

**Invitación manual sin patrocinador:** la app **no** acepta un token de invitación manual
(`POST organizations/{org}/invitations`), ni por enlace ni pegándolo. Su campo de invitación solo lee códigos o enlaces de
referido de un afiliado (`/join/{organización}/{código}`), sin sesión o con ella («Sin organización»). La invitación
manual se acepta en la página de Admin `/invitations/[token]` (Admin #72), y después la persona inicia sesión en la
app.

### C. Consentimiento con la cuenta activa
| # | Pasos | Esperado |
|---|---|---|
| C1 | Cuenta con la casilla 2 concedida al registrarse y la cuenta verificada → Verificación | «Usaremos la autorización que registraste el …», sin casilla. Se puede empezar |
| C2 | Perfil → Avisos de privacidad → la finalidad 3 → «No acepto» | Queda «No aceptaste esta finalidad.» La cuenta y la verificación no cambian |
| C3 | Igual con la 2 («No acepto») y volver a Verificación | Vuelve a pedirse la autorización antes de cualquier captura nueva. Lo ya resuelto no se invalida |
| C4 | Cuenta con un caso **en curso** desde antes de publicar el aviso → Verificación | La autorización aparece encima de los pasos. Tras registrarla, la captura sigue. En un caso aprobado o rechazado no se pide |

### N. Recuperación ante fallos de red
| # | Cómo provocarlo | Esperado |
|---|---|---|
| N1 | Modo avión antes de abrir «Crear cuenta» | «No pudimos cargar el aviso de privacidad…» con «Volver a cargar». No se puede enviar sin aviso. Al recuperar la red y recargar, todo empieza sin marcar |
| N2 | Modo avión justo antes de «Crear cuenta» | Mensaje de sin conexión. No se crea nada ni se muestra ninguna constancia. Formulario y casillas se conservan. Al reintentar con red se envía el mismo `client_request_id` |
| N3 | Respuesta perdida (el servidor creó la cuenta, pero la app no recibió la respuesta) | La app muestra el error y conserva todo. «Crear cuenta» repite el mismo `client_request_id` y la API devuelve la misma cuenta y las mismas decisiones (ejemplo 05), sin duplicados. **No se puede provocar a mano en un teléfono**: está cubierto por pruebas (*timeout* con el mismo id) |
| N4 | Igual que N3, pero la persona cierra la app antes de reintentar | Al volver, el formulario es nuevo y el id también: la API responde que la cuenta ya existe. La persona inicia sesión. Sus decisiones del primer intento están en Avisos de privacidad (lo que la API guardó) |
| N5 | Modo avión antes de «Registrar autorización» en Verificación | Mensaje de sin conexión. No aparece como registrada y «Comenzar verificación» sigue deshabilitado. Al reintentar se reutiliza el mismo id |
| N6 | «Comenzar verificación» con una respuesta perdida (el servidor creó el caso) | Iniciar un caso no es idempotente: reintentar daría 422 («ya tiene un caso activo»). La app vuelve a consultar el caso tras cualquier error al iniciar y, si existe, lo muestra en lugar de la tarjeta de inicio. Cubierto por pruebas |
| N7 | Cambiar el texto o la versión del aviso mientras el formulario está abierto (solo en un entorno aislado) | 409: «El aviso de privacidad cambió…». Las casillas se desmarcan y se muestra la versión nueva |

### E. Encuesta sin audio (respuesta propia)
| # | Pasos | Esperado |
|---|---|---|
| E1 | Admin crea, publica y distribuye una encuesta con `audio_mode: "none"` y respuesta propia en la organización de la demo | Visible en Admin como publicada |
| E2 | Con una cuenta con membresía activa y perfil de afiliado en esa organización: Encuestas | Aparece la encuesta con «Respuesta propia» y «Abierta». No aparece el aviso de datos de ejemplo |
| E3 | Abrir la encuesta → «Responder yo» → contestar → «Enviar respuesta» | No pide el micrófono ni muestra el consentimiento de grabación. En «Envíos» pasa de «Pendiente de sincronizar» a «Recibido el …» |
| E4 | Admin abre las respuestas de la versión | Una fila de respuesta propia, sin grabación, con «Sin audio» y el análisis en `not_scheduled`. Si aparece «Falló», es un defecto |
| E5 | Modo avión → responder otra vez → «Enviar respuesta» → quitar el modo avión | «Sin conexión. Se enviará cuando vuelva la señal.» Al volver la red se envía sola (al volver a primer plano o cada 60 s) o con «Sincronizar ahora». Admin muestra una sola respuesta |
| E6 | Respuesta perdida (el servidor guardó, el teléfono no recibió) | El reintento usa el mismo `client_response_id` y la API devuelve la respuesta original: una sola fila. **No se puede provocar a mano**: cubierto por pruebas |
| E7 | Después de E3, en el A06: Ajustes → Apps → Afilianet → Permisos | El micrófono aparece como no permitido: nunca se pidió. Declararlo en el manifiesto no es pedirlo (ver «Micrófono») |

**Micrófono: declarado ≠ pedido.** El APK `demo-apk` declara `RECORD_AUDIO`, el vc15 no. Android solo lo pide en un
punto: `useInterviewRecorder.start()` (`src/features/surveys/useInterviewRecorder.ts`), al pulsar «Grabar entrevista».
Ese botón solo existe en la respuesta de una **entrevista a otra persona** (`interviewed_external`) de una versión con
`audio_mode` distinto de `none` y después de que la persona entrevistada acepte la grabación. En una encuesta sin audio
y en «Responder yo» nunca se pide, sea cual sea `audio_mode`. Ninguna pantalla lo pide al abrirse. Prueba:
`survey-self-response-api.test.tsx` comprueba que «Responder yo» no consulta ni pide el permiso.

### S. Notificación push de la encuesta (después de instalar)
Antes del build quedaron comprobados la configuración y las credenciales: proyecto Expo `5675cfc3-…`, credencial
FCM V1 y archivo de Firebase de la app del mismo proyecto (`afilianet-mx`), la seguridad reforzada de push de Expo
apagada (staging no necesita `EXPO_ACCESS_TOKEN`), y `PUSH_ENABLED=true` con el worker en API y Horizon. **Nada de eso
demuestra la entrega:** un envío aceptado por Expo no demuestra que llegó. Esta prueba física es la que cuenta.

| # | Pasos | Esperado |
|---|---|---|
| S1 | Perfil → «Configurar notificaciones» → «Activar en este teléfono» | Aparece el diálogo de permiso de Android, la única vez que la app lo pide. Tras permitir: «Teléfono registrado. Ya puede recibir notificaciones.» y «Activadas en este teléfono». El botón queda deshabilitado mientras no cargan las preferencias o si dicen que push está «en preparación» |
| S2 | API comprueba el registro (solo lectura) | Una fila en `push_devices` del usuario, ligada a la sesión actual. Al reabrir la pantalla, la app dice «Permiso concedido. Confirma el registro…» aunque ya esté registrada: ese estado no se guarda en el teléfono. Volver a pulsar repite el mismo registro |
| S3 | Admin distribuye la encuesta sin audio **solo** en la organización A, revisando antes sus destinatarios | Llega al teléfono con el texto genérico: «Afilianet» / «Tienes una nueva notificación. Abre Afilianet para consultarla.» (no el título de la encuesta). Con la app abierta también se ve el aviso. La notificación aparece además en la bandeja de la app |
| S4 | Tocar la notificación (con la app abierta, en segundo plano y cerrada) | Selecciona la organización A y abre esa encuesta (`/surveys/{survey_id}`). Si el id no es válido abre la bandeja de Encuestas. No marca nada como leído |
| S5 | Tocarla con la sesión cerrada, o con una cuenta que no es miembro de A | No abre nada (por diseño) |

Requisitos para recibirla: cuenta activa o pendiente, membresía **activa** en A y avisos operativos no desactivados en
esa organización (sin preferencia guardada cuentan como activados). Si se cierra sesión y se vuelve a entrar, la app
vuelve a registrar el teléfono sola al pasar a primer plano (como mucho cada 60 s), siempre que el permiso ya se haya
concedido.

**Si no llega:** revisar en API el estado de `push_deliveries` (`accepted`, `failed` con su `error_code`, o `unknown`)
y, unos 15 minutos después, el recibo (`CheckPushReceipt`). No reenviar a ciegas: un envío ambiguo no se repite.

**Requisitos confirmados por API** (código de #125 @ `b7f0f61`; Surveys no cambió desde `b1629a6`)
- **Cuenta:** membresía con estado activo en la organización (cualquier rol) y un perfil de afiliado en ella, en
  cualquier estado (también pendiente). Sin perfil: 403 `no_affiliate_profile`, que la app muestra como envío bloqueado.
- **KYC:** ninguna regla en la lista, la versión ni las respuestas. El aviso nuevo publicado tampoco bloquea mientras
  `PRIVACY_NOTICE_ENFORCE_REVIEW` siga en `false`, que es lo que hay y lo previsto.
- **Distribución:** solo notifica. Cualquier miembro activo con perfil de afiliado puede responder cualquier versión
  publicada y abierta de su organización, la haya recibido o no.
- **Análisis de calidad:** lo controla `SURVEYS_QUALITY_ANALYSIS_ENABLED`. Sin definir vale `false` con
  `APP_ENV=staging`: la respuesta queda en `not_scheduled` y no se encola nada. Respuesta propia sin audio: no hay
  transcripción. **Solo surte efecto cuando Infra despliegue #125**; la imagen actual de staging no lo lleva.
- **Admin:** necesita Admin #67 fusionado y desplegado, con `ADMIN_SURVEYS_SOURCE=http`.
- **Contrato:** los ejemplos de API (sobre `b1629a6`, con el análisis apagado y sin nada encolado) se sirven tal cual en
  `src/tests/app/survey-self-response-contract.test.tsx`.

**Build del candidato con encuestas: vc16, construido el 2026-11-04, sin instalar**
- EAS `8c5ccc89-414d-4713-a2f8-7125b1e9c3bc`, perfil `demo-apk`, commit `92ad7cd4f2a2ca80eccbad28dc75621d79cefac8`
  (sin merge), `versionCode` 16. Firma v2 con el mismo certificado que vc14 y vc15 (SHA-256 `5d3974b9…6320ca`). APK
  SHA-256 `c88108b1b6d1e69bca41ac8b6c782d521413dca54a60509b918a2ab93edecda8`.
- En el log: `check-build-env` → «Configuración de compilación válida»; `GOOGLE_SERVICES_JSON` presente (secreto del
  entorno `preview`); `processReleaseGoogleServices` ejecutado; `EXPO_PUBLIC_SURVEYS_PREVIEW=1` y
  `EXPO_PUBLIC_SURVEYS_SOURCE=api`.
- En el APK: paquete `com.afilianet.mobile`, `POST_NOTIFICATIONS`, `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`
  declarados, recursos de Firebase del proyecto `afilianet-mx`, y la URL de la API de staging en el bundle.
- **Perfil EAS:** `demo-apk`. Extiende `store-beta-apk` y solo añade `EXPO_PUBLIC_SURVEYS_PREVIEW=1` y
  `EXPO_PUBLIC_SURVEYS_SOURCE=api`.
- **Lo demás se hereda:** `EXPO_PUBLIC_API_BASE_URL=https://staging-api.afilianet.mx`, `EXPO_PUBLIC_APP_ENV=staging`,
  `EXPO_NO_DOTENV=1`, Sentry y PostHog apagados, entorno EAS `preview`, APK interno, `autoIncrement` y credenciales
  remotas.
- **Mismo paquete** `com.afilianet.mobile`, sin `APP_VARIANT`. Firma con el keystore asociado a la app y contador
  remoto de `versionCode` compartido. Keystore remoto por defecto («Build Credentials xqfR9Qajv1»); la huella se
  comparó en el APK resultante.
- **Precedencia** (comprobada en `eas-cli` 26.0.0): `{ ...variables del entorno EAS, ...env del perfil }`. Lo que fija
  `eas.json` gana aunque el entorno EAS `preview` defina la misma variable, y `extends` combina los `env` del perfil
  hijo sobre los del padre. Con `EXPO_NO_DOTENV=1`, ningún archivo `.env` entra en el build.
- **Comprobación en el servidor de EAS:** `eas-build-pre-install` ejecuta `scripts/check-build-env.mjs` con el entorno
  ya combinado. Para `demo-apk` exige las dos variables exactas y staging, y rechaza la telemetría y `APP_VARIANT`.
- **Permisos:** con las encuestas encendidas, el manifiesto conserva `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`, que
  `store-beta-apk` quita. Solo se piden al grabar una entrevista con audio; nunca en una respuesta propia.
- **Sustituir el vc15:** este APK se instala sobre el vc15 del A06 como actualización (mismo paquete y firma) y
  conserva la sesión. Volver al vc15 exigiría desinstalar.

## 5. Fuera de esta demo
- Términos generales (casilla 1 con términos): no existen (P1).
- Casillas de finalidad en la invitación de personal: no están en #88.
- La activación por enlace de correo con decisiones: Mobile no la usa.
- Constancia descargable para la persona (P9).
