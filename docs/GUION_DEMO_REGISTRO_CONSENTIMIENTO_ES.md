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
| API | #119 `integration/demo-2026-11-09` | `5583511294fcf464480e19606932a7c3a818f64a` | 41759538964 |
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
| A3 | La persona activa su cuenta en el teléfono con «¿Olvidaste tu contraseña?» y entra | Entra con su propia sesión. **Envía un correo o SMS real** (ver §2) |
| A4 | La persona abre Verificación | Ve la autorización con el texto del aviso y la casilla sin marcar. Si su correo o celular no está verificado, primero se le pide confirmarlo |
| A5 | Marca y pulsa «Registrar autorización» | «Comenzar verificación» se habilita solo cuando la API la devuelve como efectiva |

El enlace de activación por correo (`/assisted-enrollments/activate/{token}`) admite `consents`, pero Mobile no lo
abre. En Mobile, la persona decide desde su propia sesión, en A4 y A5.

**Con la puerta activa, el patrocinador no puede capturar por la persona (P5):**
- antes de que ella decida, la API responde 403 `consent_required` (`assisted_person`);
- después de que active su cuenta, responde 409 `assisted_access_claimed` («la persona ya activó su cuenta»).

En la demo, el alta asistida termina así: **la persona activa su cuenta y hace ella misma su verificación.**

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

## 5. Fuera de esta demo
- Términos generales (casilla 1 con términos): no existen (P1).
- Casillas de finalidad en la invitación de personal: no están en #88.
- La activación por enlace de correo con decisiones: Mobile no la usa.
- Constancia descargable para la persona (P9).
