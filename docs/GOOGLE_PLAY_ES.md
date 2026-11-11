# Google Play: prueba interna, prueba cerrada y lanzamiento

**Estado (2026-11-10): preparación, sin ejecutar.** No se ha construido ningún AAB ni se ha subido nada a Play. No se cambió el paquete, la firma ni ninguna credencial.

**Cuenta de Play Console (dato de Andrés, 2026-11-10):** personal, con la verificación en proceso y sin apps creadas. El estado de la verificación se consulta en Play Console:
- **Inicio**, donde aparecen los avisos de verificación pendiente;
- **Configuración** (engrane) → **Detalles de la cuenta de desarrollador**.

Este documento no supone ese estado.

**Fuentes:**
- código de Mobile en `297f5b0` (candidato #94, que contiene vc21);
- el APK de vc21 (`79eca878…`), inspeccionado;
- API `main` `c62d7fe4`, según API-51 (2026-11-10);
- lecturas públicas de Infra-5a (2026-11-10);
- ayuda oficial de Play, enlazada en cada punto.

Lo que dice «pendiente» o «no consta» **no se declara** en Play.

---

## 1. Camino que corresponde a esta cuenta

Las cuentas personales creadas después del 13 de noviembre de 2023 deben pasar una **prueba cerrada con al menos 12 testers inscritos durante 14 días seguidos** antes de pedir acceso a producción ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)). Mientras tanto, la pista de producción queda bloqueada.

| Etapa | Para qué | Revisión de Google | Entorno |
|---|---|---|---|
| 1. Prueba interna | Instalar desde Play un AAB firmado por Play, con hasta 100 personas | Sin revisión de contenido | Staging (ver la sección 2) |
| 2. Prueba cerrada | Cumplir los 12 testers durante 14 días | **Sí:** Google revisa la versión y las declaraciones | Staging |
| 3. Solicitud de producción | Formulario de Play sobre la prueba cerrada | Sí | — |
| 4. Producción | Lanzamiento público | Sí | **Producción**, con el perfil `production`. Nunca un AAB de staging |

**Opción que decide Andrés:** una cuenta de **organización** a nombre de LUNI LABS SAPI DE CV, el responsable del aviso.
- No tiene el requisito de 12 testers durante 14 días y muestra a la empresa como desarrollador.
- Pide un número D-U-N-S y su propia verificación.
- Este documento no supone cuál conviene.

**Regla:** una versión de staging nunca se promueve a producción. Producción usa un AAB propio del perfil `production`, con un versionCode mayor.

---

## 2. Candidato y perfil AAB

### Producción: hoy no es posible
- `production` (AAB, entorno EAS `production`) **falla cerrado**. `check-build-env` lo rechaza hoy por tres motivos, comprobado en `297f5b0`:
  - falta `EXPO_PUBLIC_API_BASE_URL`, porque no existe API de producción: `api.afilianet.mx` no resuelve (Infra, HOY);
  - falta `EXPO_PUBLIC_REFERRAL_LANDING_URL`;
  - falta `GOOGLE_SERVICES_JSON` en el entorno EAS `production`.
- Detalle: [`PERFIL_PRODUCCION_ES.md`](PERFIL_PRODUCCION_ES.md).

### Prueba interna y cerrada: `store-beta` desde el head de #95

| | Valor |
|---|---|
| Commit | El head de #95 (`docs/google-play-readiness`): `297f5b0` (#94 ⊃ #93 ⊃ #92, el código de vc21) más las correcciones de Play de este PR. El SHA exacto se registra al autorizar el build |
| Perfil | `store-beta`, que genera un **AAB** (`app-bundle`), distribución `store` y entorno EAS `preview` |
| API | `https://staging-api.afilianet.mx`, la que exige `check-build-env` |
| Paquete | `com.afilianet.mobile`, sin cambios |
| versionCode | El remoto está en 21, así que el AAB sería el **22** |
| Funciones | Encuestas y audio **apagados** (`SURVEYS_PREVIEW=0`, sin `RECORD_AUDIO`); WhatsApp **`"0"` explícito** (este PR; antes sin definir), así que solo SMS y la app no consulta canales; comercio (ventas, monedero y pagos) **oculto** (`releaseFeatures.commerce=false`); Sentry y PostHog **apagados** |
| SDK | `targetSdk` 36 y `minSdk` 24, comprobado en vc21. Play exige el 36 desde el 31 de agosto de 2026 ([target API](https://support.google.com/googleplay/android-developer/answer/11926878)) |
| 16 KB | Las 31 librerías arm64 de vc21 tienen alineación ELF ≥ 16 KB y están alineadas en el ZIP ([16 KB](https://developer.android.com/guide/practices/page-sizes)) |

- **No es vc21.** vc21 es `demo-apk`: un APK con encuestas reales y WhatsApp permitido. Play recibe un AAB `store-beta` del mismo commit.
- **Consecuencia:** los testers de Play usan **staging**. Sus cuentas, datos y constancias quedan en staging y no pasan a producción.

### Firma: decisión de Andrés antes de la primera subida

Las apps nuevas en Play usan **Play App Signing**:
- la **clave de firma de la app** la guarda Google;
- el desarrollador firma con una **clave de subida**.

La decisión se toma al subir el primer AAB y **no se puede deshacer** para la clave de firma.

| | **A. Google genera la clave de firma** (recomendada) | **B. La clave actual de EAS pasa a ser la de firma** |
|---|---|---|
| Qué firma cada cosa | Google firma lo que se instala desde Play. El almacén de EAS (`5d3974b9…6320ca`) solo firma el AAB que se sube: es la **clave de subida** | Google firma con **la misma** clave de EAS, `5d3974b9…6320ca` |
| vc12–vc21 y los APK ya instalados | **No se actualizan desde Play** ni al revés: el certificado es distinto, así que Android rechaza la actualización. Hay que desinstalar, y se pierden la sesión, los borradores y el outbox | Sí se actualizan: misma firma y un versionCode mayor |
| Custodia | Google guarda la clave de firma, que no podemos perder. EAS guarda la de subida (credenciales remotas del proyecto) | Hay dos copias de la clave de firma, en Google y en EAS. Esa clave ya firmó APK distribuidos fuera de Play y queda expuesta a más lugares |
| Si se pierde o se filtra la clave de subida | Se pide en Play Console (**Integridad de la app → Firma de apps**) un **restablecimiento de la clave de subida**: se genera otra (EAS puede crearla) y se registra su certificado. Las instalaciones no se ven afectadas | Si se usa la misma como subida, el mismo restablecimiento. Si se filtra la de firma, no hay restablecimiento simple: firma todas las versiones |
| Pasos | 1. Subir el primer AAB firmado por EAS. 2. Aceptar «Clave de firma generada por Google». **No se exporta nada** | 1. **Exportar el almacén de EAS** (`eas credentials` → Android → descargar el keystore con sus contraseñas): **es una operación de credenciales y requiere autorización expresa**. 2. Cifrar la clave con la herramienta que indica Play (PEPK) y subirla en «Usar una clave existente». 3. Conviene registrar una clave de subida distinta |
| App Links | `assetlinks.json` lleva el SHA-256 de la clave de Google (está en Play Console → Firma de apps) y, si se quiere que también verifiquen los APK de staging, el de EAS | Un solo SHA-256 (`5d3974b9…`) para todo |

**Recomendación: A.**
- No hay que exportar credenciales.
- La base instalada con APK es mínima: el A06 y equipos de prueba.
- La clave de producción no queda expuesta donde ya estuvo la de los APK.

Elegir **B** solo tiene sentido si se quiere que los teléfonos con un APK pasen a la versión de Play sin desinstalar.

**¿Un paquete con sufijo de prueba (por ejemplo `com.afilianet.mobile.staging`)? No se recomienda:**
- sería **otra app** en Play, con su propia ficha;
- su prueba cerrada **no** cuenta para el acceso a producción de `com.afilianet.mobile`, porque el requisito de 12 × 14 y el acceso son por app.

**No se cambia el paquete.** `com.afilianet.mobile` queda fijado en Play con la primera subida y ninguna otra app puede usarlo. Un teléfono no puede tener a la vez la versión de Play y un APK de staging del mismo paquete.

---

## 3. Crear la ficha de Afilianet (Play Console)

1. **Crear app:**
   - nombre «Afilianet»;
   - idioma predeterminado «Español (Latinoamérica) – es-419»;
   - App (no juego);
   - Gratis;
   - aceptar las declaraciones.
   La app **no** se crea hasta que la cuenta lo permita.
2. **Configuración de la app → Contenido de la app**, con las declaraciones de la sección 5.
3. **Presencia en la tienda → Ficha principal**, con los materiales de la sección 4.
4. **Pruebas → Prueba interna:** crear la lista de testers y subir el primer AAB **a mano**. La primera subida de una app nueva es manual. Aquí se elige la opción de firma de la sección 2.
5. **Países:** México, para la prueba cerrada.

`eas.json` no tiene `submit` para Play (`submit.production` está vacío) y no hay cuenta de servicio. Las subidas son manuales hasta que Andrés decida otra cosa.

---

## 4. Materiales de la tienda (según lo que hace el build `store-beta`)

**Lo que el AAB `store-beta` permite hacer de verdad:**
- crear una cuenta con correo, celular o ambos, más una contraseña;
- iniciar sesión con correo o celular y contraseña;
- recuperar el acceso;
- verificar el correo (enlace) y el celular (código por SMS);
- unirse a una organización con una liga o un código de referido, o aceptar una invitación;
- la verificación de identidad que pida la organización: fotos de la credencial, prueba de vida y comparación de rostro, y ubicación opcional;
- ver la red: patrocinador, posición y personas referidas;
- invitar con liga, QR, «Compartir», WhatsApp (abre WhatsApp con el mensaje) o correo;
- notificaciones de la cuenta y de la organización, con preferencias;
- avisos de privacidad y constancias de consentimiento;
- solicitar salir de una organización y solicitar la eliminación de la cuenta.

**Lo que no hace este build** y por tanto no se anuncia: encuestas, grabación de audio, ventas, monedero, comisiones, pagos, ni WhatsApp para códigos.

**Textos propuestos.** Andrés los revisa. No se usan palabras que el producto no haya decidido, como «partido», «elección» o «votar».
- **Nombre** (máx. 30): `Afilianet`
- **Descripción breve** (máx. 80): `Únete a tu organización, verifica tu identidad y administra tu red de referidos.`
- **Descripción completa** (borrador):
  > Afilianet es la app para las personas afiliadas a las organizaciones que usan la plataforma.
  >
  > • Crea tu cuenta con tu correo o tu celular y verifícalos.
  > • Únete a tu organización con una liga o un código de referido.
  > • Si tu organización lo pide, verifica tu identidad con fotos de tu credencial y una prueba de vida.
  > • Consulta tu red: quién te invitó y a quién has invitado.
  > • Invita a otras personas con tu liga, un código QR, WhatsApp o correo.
  > • Recibe avisos de tu cuenta y de tu organización, y elige qué notificaciones quieres.
  > • Consulta los avisos de privacidad y solicita la eliminación de tu cuenta desde la app.
  >
  > Afilianet es un producto de LUNI LABS SAPI DE CV.

**Gráficos:**

| Recurso | Requisito de Play | Lo que hay |
|---|---|---|
| Ícono | PNG de 512 × 512 | `assets/brand/afilianet-app-icon-1024.png` (1024 × 1024): basta exportarlo a 512 |
| Gráfico de funciones | 1024 × 500 | **No existe** |
| Capturas de teléfono | Al menos 2 | **No existen.** Hay que tomarlas en staging con cuentas de prueba. **Nunca con documentos de identidad reales ni rostros de personas reales.** Mobile no toma capturas |

- **Categoría sugerida:** «Social» o «Herramientas»; decide Andrés.
- **Correo de contacto:** `servicioalcliente@afilianet.mx` (el del aviso).
- **Sitio web:** `https://afilianet.mx`.

---

## 5. Contenido de la app: declaraciones

| Declaración | Respuesta según el código | Estado |
|---|---|---|
| **Política de privacidad (URL)** | `https://afilianet.mx/privacidad`. Publicada el 2026-11-10: responde 200 sin sesión con el aviso aprobado completo («Versión 2026-11-03.general.2 · Fecha del documento: 2026-11-03») y contacto `servicioalcliente@afilianet.mx`, sin marcadores. Lleva `robots noindex, nofollow`; Play solo necesita que sea accesible | **Lista.** Es la URL que se pone en Play Console |
| **Términos de uso** | No publicados. Los términos de identidad no los sustituyen | Pendiente (Andrés). Play no los pide para la prueba interna |
| **Anuncios** | No contiene anuncios: no hay SDK de anuncios ni el permiso `AD_ID` en vc21 | Listo. Verificarlo de nuevo en el AAB |
| **Acceso a la app** | Requiere iniciar sesión (sección 7) | Pendiente: la cuenta del revisor |
| **Clasificación del contenido** | Cuestionario IARC. Sin violencia ni contenido sexual. Hay interacción entre usuarios (invitaciones) y se comparte la ubicación opcional con el servidor | Lo llena Andrés |
| **Público objetivo** | 18 años o más (verificación de identidad con credencial) | Decide Andrés |
| **Funciones financieras** | Este build **no** tiene monedero, pagos ni comisiones (`commerce=false`) | Responder según este build; cambia cuando vuelva el comercio |
| **Apps gubernamentales, de salud o de noticias** | No | Confirmar con Andrés |
| **ID de publicidad** | No se usa | Listo |
| **Servicio en primer plano** | No declara permisos `FOREGROUND_SERVICE_*`. `expo-location` trae un servicio de ubicación que no se usa sin ese permiso | No aplica |
| **Fotos y videos** | No pide `READ_MEDIA_*` ni `READ_EXTERNAL_STORAGE` (se quita). La cámara guarda en la caché privada | No aplica |
| **Ubicación** | Solo en primer plano (`ACCESS_FINE_LOCATION`/`COARSE`, sin `BACKGROUND`), opcional y con botón de consentimiento | Va en Data safety |

**Tema sensible que Andrés debe decidir antes de Data safety.** Según API-51, la verificación recibe la clave de elector, la sección electoral y la asignación territorial.
- Si las organizaciones son políticas, la afiliación puede revelar opiniones políticas: Play tiene la categoría «Creencias políticas o religiosas».
- Este documento **no** lo supone. Andrés define qué son las organizaciones y cómo se describen.

---

## 6. Data safety (borrador, solo para el build `store-beta`)

**Prácticas de seguridad:**
- **Cifrado en tránsito:** sí. Todo va por HTTPS y `check-build-env` rechaza URLs sin HTTPS.
- **Cifrado en reposo:** según el Terraform de staging (Aurora y S3 con KMS). No es una pregunta del formulario.
- **Mecanismo para pedir la eliminación:** existe en la app, **pero hoy el servidor lo rechaza** (sección 7). No se marca hasta que funcione.

**Cómo se comprobó.** Para cada función se revisó si está en el bundle de `store-beta` y si es **alcanzable**: perfil, banderas y rutas protegidas. Si el código puede enviar un dato en ese build, se declara, aunque esté detrás de una configuración del servidor.

| Función | ¿En el bundle? | ¿Alcanzable en `store-beta`? | Conclusión |
|---|---|---|---|
| Identidad: fotos de la credencial; CURP, clave de elector, domicilio, fecha de nacimiento y sexo que devuelve el OCR | Sí | **Sí**, si la organización pide KYC con la captura encendida. Con `capture_enabled=false`, el servidor responde 503 `kyc_unavailable` | **Declarar** |
| Prueba de vida y rostro (selfie, AWS Face Liveness) | Sí (módulo nativo Amplify UI) | Igual que identidad | **Declarar** |
| Ubicación de la verificación | Sí | Sí, opcional, con un botón de consentimiento | **Declarar** (precisa, opcional) |
| Sección electoral y entidad | Las lee el servidor de la credencial; la app muestra los campos | Igual que identidad | **Declarar**; la categoría la decide Andrés |
| **Registro asistido** (fotos de la INE y ubicación de **otra persona**) | Sí | **Sí, para cualquier persona afiliada:** Red → «Registrar a alguien» (`network.tsx`) | **Declarar** como datos de terceros, o apagarlo en este build con una bandera nueva. **Decide Andrés** |
| Encuestas y audio | El código sí | **No:** `Tabs.Protected guard={surveysPreviewEnabled}` bloquea también los deep links, el push no navega y el manifiesto no tiene `RECORD_AUDIO` | No se declara |
| Push | Sí | Sí, con el permiso de notificaciones | **Declarar** (ID del dispositivo) |
| Contactos del teléfono | No hay `READ_CONTACTS` | No | No se declara. Lo que el usuario escribe al invitar va como «información personal de terceros» |
| Telemetría: Sentry y PostHog | **Sí, los SDK van incluidos** | **No:** sin `Sentry.init` (`EXPO_PUBLIC_SENTRY_ENABLED=0`, DSN `disabled`, `io.sentry.auto-init=false`) y PostHog sin clave (`analytics` no crea el cliente). `check-build-env` rechaza el build si llega un DSN o una clave | No se declara |
| Pagos y monedero | El código sí | **No:** `releaseFeatures.commerce=false`. Pestañas en `Tabs.Protected`; `commissions`, `payouts` y `payout-request` en `CommercialFeatureGate` (redirige a Inicio); `routes` anula esos destinos de notificaciones | No se declara |

**Respuestas por categoría de Play (`store-beta`):**

| Categoría → tipo | Recogido | Compartido | Obligatorio u opcional | Finalidad | Tránsito HTTPS | Borrado a petición |
|---|---|---|---|---|---|---|
| Info personal → Nombre | Sí | No | Obligatorio | Funcionalidad de la app, gestión de la cuenta | Sí | Sí (*) |
| Info personal → Correo | Sí | No | Correo o celular | Gestión de la cuenta, comunicaciones | Sí | Sí (*) |
| Info personal → Teléfono | Sí | No | Correo o celular | Gestión de la cuenta, comunicaciones | Sí | Sí (*) |
| Info personal → ID de usuario | Sí | No | Obligatorio | Gestión de la cuenta | Sí | Sí (*) |
| Info personal → Dirección | Sí (OCR) | No | Opcional (solo con KYC) | Prevención de fraude, seguridad y cumplimiento | Sí | Sí (*) |
| Info personal → Otra información (CURP, clave de elector, nacimiento, sexo, entidad y sección) | Sí | No | Opcional (solo con KYC) | Prevención de fraude, seguridad y cumplimiento | Sí | Sí (*) |
| Info personal → Creencias políticas o religiosas | **Decide Andrés** | — | — | — | — | — |
| Fotos y videos → Fotos | Sí (credencial y selfie) | No | Opcional (solo con KYC) | Prevención de fraude, seguridad y cumplimiento | Sí | Sí (*) |
| Fotos y videos → Videos | Sí (prueba de vida) | No | Opcional (solo con KYC) | Prevención de fraude, seguridad y cumplimiento | Sí | Sí (*) |
| Ubicación → Precisa | Sí | No | Opcional | Prevención de fraude, seguridad y cumplimiento | Sí | Sí (*) |
| ID de dispositivo u otros | Sí (token de push) | No | Opcional | Funcionalidad de la app (notificaciones) | Sí | Sí (se borra al cerrar sesión y con la cuenta) |
| Datos de terceros (registro asistido e invitaciones) | **Decide Andrés** | — | — | — | — | — |

- «Compartido: No»: AWS, Expo, FCM y APNs son **encargados** que procesan por cuenta de Afilianet, y Play no lo cuenta como compartir. OpenAI está apagado. Meta no está integrada en `main`.
- Cifrado en reposo, según el Terraform de staging: Aurora con CMK y S3 de evidencia con SSE-KMS y versionado. Play no lo pregunta como tal; solo se menciona si Andrés lo quiere en el aviso.
- (*) «Se puede solicitar la eliminación: **Sí, por el canal publicado (correo)**; el formulario en la app está cerrado por ahora». Son dos vías distintas:
  - **Formulario** en la app y en la web de Admin de staging: hoy **cerrado** (`accepting:false`, 503).
  - **Canal por correo:** **publicado** en `https://afilianet.mx/eliminar-cuenta` (`servicioalcliente@afilianet.mx`, asunto «Privacidad Afilianet»). Google admite ese canal, así que la respuesta no depende solo de abrir el formulario.
- **Que los datos efectivamente se eliminan: pendiente de confirmar la operación** (API-51 confirma quién atiende y cómo se ejecuta una eliminación procedente con el borrado automático apagado). Recibir solicitudes no equivale a poder completarlas; no se cierra esta declaración hasta tener esa respuesta. Además, lo financiero, ser owner y las encuestas pasan a revisión manual. Sobre respaldos, solo el texto del aviso (§6): «Los respaldos aislados se extinguirán según su ciclo documentado». No se declara ningún límite de días para el borrado. La URL que se declara en «Eliminación de datos» es `https://afilianet.mx/eliminar-cuenta`.

**Retención:**
- **No se declaran días.** La política (`RETENTION_POLICY.md` v2026-10-02.2) no está adoptada ni aplicada: `PRIVACY_RETENTION_SCHEDULE_ENABLED=false`, y las `EVIDENCE_RETENTION_*` están vacías.
- El aviso vigente la marca como pendiente.

---

## 7. Pendientes: eliminación, privacidad y revisor

### Eliminación de cuenta
Play exige dos cosas ([requisitos](https://support.google.com/googleplay/android-developer/answer/13327111)):
- una opción **dentro de la app**;
- un **enlace web** que funcione y nombre a la app o al desarrollador, declarado en Data safety.

Congelar o desactivar la cuenta no cuenta como eliminación.

**Cómo se llega al canal desde la app (en este PR, autorizado por Andrés el 2026-11-10):**
- Destinos fijos en `src/config/publicPrivacy.ts`, sin tokens ni datos de la cuenta: `https://afilianet.mx/privacidad`, `https://afilianet.mx/eliminar-cuenta` y `mailto:servicioalcliente@afilianet.mx?subject=Privacidad%20Afilianet` (solo el asunto; nada de contraseña, folio ni datos).
- **«Eliminar mi cuenta» (con sesión):** muestra siempre el correo, visible y copiable; botón «Escribir a privacidad» (abre el correo con el asunto) y enlace «Cómo eliminar tu cuenta». Con el 503 remite a ese canal. Ya no depende de `/privacy/notice`.
- **Login (sin sesión):** «Aviso de privacidad» y «Cómo eliminar tu cuenta» abren las páginas públicas en el navegador, sin llamar a la API.
- **Aviso de privacidad dentro de la app:** «Ver la versión pública del aviso» y «Cómo eliminar tu cuenta», disponibles aunque el aviso no cargue.
- **Si no se puede abrir:** sin aplicación de correo, dice «No se envió ninguna solicitud», ofrece «Copiar correo» y la página pública; sin navegador, muestra las direcciones para escribirlas. Nunca dice que se envió algo.
- Pruebas: `src/tests/app/public-privacy-links.test.tsx` y `delete-account.test.tsx`. Solo se ve en un build nuevo (vc22).

| Requisito | Estado |
|---|---|
| Opción en la app | **Hecha:** Perfil → «Administrar mi cuenta» → «Eliminar mi cuenta». Pide la contraseña y escribir ELIMINAR, y muestra el folio (`delete-account.tsx`, desde 0190e68). **En este PR:** la pantalla muestra siempre el canal de privacidad del aviso (el `contact_email` de `/privacy/notice`). Con un 503 dice «No se registró ninguna solicitud» y remite a ese canal, como promete el aviso, en lugar del error genérico |
| El formulario (app y web de Admin) la acepta | **No, cerrado:** `accepting:false`; `PRIVACY_DELETION_REQUESTS_ENABLED` no está definida en staging (vale false), así que responde 503 «no disponible por el momento». Lo decide Andrés; lo ejecuta API o Infra |
| Página web | **Publicada el 2026-11-10:** `https://afilianet.mx/eliminar-cuenta` responde 200 sin sesión. Describe el procedimiento por correo (canal y datos a indicar del aviso §7), los plazos de §7 y la conservación y respaldos de §6, literales, y enlaza a `/privacidad`. Sin marcadores; `noindex, nofollow`. Es la URL de Data safety → «Eliminación de datos». Cuando se abra la recepción en la app, la página pasará a la variante con app y web |
| Vía web sin la app | **Canal por correo, publicado** (la página). Es la vía vigente y Google la admite. La API tiene `POST /api/v1/privacy/deletion-requests`, pero sin formulario HTML y hoy responde 503. La opción en la app responde 503 y remite al mismo canal, coherente con la página |
| Qué pasa después | Según el aviso (§7): «se resolverán en un máximo de 20 días hábiles desde su recepción; si resultan procedentes, se harán efectivas dentro de los 15 días hábiles siguientes». La app muestra solo el plazo de respuesta de `response_deadline`. Lo ejecuta un operador; no hay borrado automático. Conservación, con el texto del aviso (§6): «Los comprobantes de consentimiento y atención de solicitudes podrán conservarse separados por el periodo necesario para acreditar cumplimiento» y «Los respaldos aislados se extinguirán según su ciclo documentado». Los «36 meses» del folio y los «90 días» de respaldos de los documentos de la API están **documentados, no adoptados**: Aurora de staging guarda 7 días y el bucket de evidencias tiene versionado sin expiración. No se publican como hecho. Lo financiero, ser owner o superadmin y las encuestas pasan a revisión manual. Los docs de la API dicen «no publicar como servicio de eliminación terminado»: hay que alinear el texto de la página con eso |

### Aviso de privacidad
- El vigente en staging es `2026-11-03.general.2` (API). Responsable: LUNI LABS SAPI DE CV. Contacto: `servicioalcliente@afilianet.mx`.
- **Publicado** en `https://afilianet.mx/privacidad` (2026-11-10), la URL para Play Console.
- Falta:
  - que el texto cubra lo que declara Data safety: terceros del registro asistido, ubicación, biometría y token de push.

### Acceso del revisor de Google
- Google revisa la prueba cerrada y producción. Necesita una cuenta que funcione y las instrucciones en **Contenido de la app → Acceso a la app**.
- **Hecho:** el login es correo o celular más contraseña, sin OTP (API-51).
- **Falta**, y lo decide Andrés:
  - una cuenta de revisor en staging;
  - una organización con `compliance_config.capture_enabled=false`, para que no pida documentos reales;
  - una liga o código para unirse.
  No hay modo de revisor ni manera de saltarse el KYC (API-51).
- **Plantilla de instrucciones** (llenarla cuando existan la cuenta y la organización):
  > Inicia sesión con el correo y la contraseña de abajo. La cuenta ya pertenece a la organización de prueba «…», que no pide verificación de identidad. Puedes revisar Inicio, Red (patrocinador y referidos), Invitar (liga y QR), Notificaciones y Perfil → Administrar mi cuenta → Eliminar mi cuenta. No es necesario verificar el celular para usar estas secciones.
- La última frase hay que comprobarla en el build antes de enviarla.

### Otros pendientes de staging que afectan a los testers
- **SMS de staging apagado:** los testers no pueden verificar el celular ni recuperar la contraseña por SMS.
- **El correo solo sale a la lista permitida:** la verificación por correo no llega a direcciones fuera de la lista.
- **KYC:** la organización de la prueba debe tener la captura apagada, o Andrés autoriza de forma expresa la captura biométrica real con su aviso (ver [`BETA_ANDROID_ES.md`](BETA_ANDROID_ES.md), hito B).

---

## 8. Participantes de la prueba cerrada

1. **Lista:**
   - en **Pruebas → Prueba cerrada → Testers**, una lista de correos o un Grupo de Google;
   - **al menos 12 personas**, mejor 15 o más por si alguien se da de baja;
   - con cuentas de Google reales que usen en un Android 7 o superior con cámara.
2. **Invitación:**
   - Play da un **enlace de participación**;
   - cada persona lo abre con su cuenta de Google, acepta y luego instala Afilianet **desde Play**. Un APK instalado a mano no cuenta.
3. **14 días seguidos:**
   - cada persona tiene que seguir inscrita los 14 días;
   - si alguien se da de baja antes, sus días no cuentan, aunque vuelva a inscribirse ([FAQ](https://support.google.com/googleplay/android-developer/answer/14151465)).
4. **Qué les pedimos:**
   - crear su cuenta;
   - unirse a la organización de prueba con la liga;
   - recorrer Inicio, Red, Invitar, Notificaciones y Perfil;
   - mandar sus comentarios por la vía que se acuerde (correo `servicioalcliente@afilianet.mx` u otra);
   - **no subir documentos reales** si la organización no tiene la captura apagada.
5. **Qué les decimos:**
   - es una versión de prueba conectada a un entorno de pruebas;
   - sus datos no pasan a la versión pública;
   - pueden pedir la eliminación desde la app cuando el servidor la acepte.
6. **Al final:**
   - en Play Console → **Solicitar acceso a producción**, responder el formulario sobre la prueba: cómo se reclutó a los testers, qué se corrigió y por qué la app está lista;
   - la revisión suele tardar 7 días o menos.

---

## 9. Pasos exactos para autorizar la prueba interna

Primero, lo que decide o hace Andrés:
1. Verificación de la cuenta completa, comprobada en Play Console (ver el inicio de este documento).
2. Decidir el **entorno** de la prueba interna: `store-beta` contra staging (sección 2).
3. Decidir la **firma**: opción A o B (sección 2).
4. Crear la app en Play Console (sección 3, pasos 1–3). URL de la política de privacidad: `https://afilianet.mx/privacidad`; URL de eliminación de cuenta (Data safety): `https://afilianet.mx/eliminar-cuenta`. Play muestra en su **Panel** las tareas que exige para cada pista.

Después, lo que Mobile ejecuta solo con autorización en su sesión:
5. Autorizar **un** build AAB:
   - perfil `store-beta`, desde el head de #95 con el CI en verde (el SHA completo se registra antes de lanzar);
   - versionCode 22;
   - comando: `npx eas-cli build -p android -e store-beta --non-interactive --no-wait`.
   Antes de lanzarlo, Mobile comprueba que el CI siga en verde, que el 22 esté libre y que el entorno resuelto sea staging, sin WhatsApp ni encuestas. Al terminar verifica:
   - el paquete;
   - el versionCode;
   - el `targetSdk` 36;
   - la alineación de 16 KB;
   - los permisos (sin `RECORD_AUDIO` ni `AD_ID`);
   - el certificado de subida `5d3974b9…6320ca`;
   - el SHA-256.
   Entrega el `.aab` en `~/afilianet-beta`.
6. Andrés lo sube **a mano** en Prueba interna, acepta Play App Signing con la opción elegida, agrega la lista de testers internos y comparte el enlace.
7. Instalar desde Play en un teléfono que **no** tenga un APK de Afilianet: el A06 tiene vc19 con la cuenta protegida, así que no.

Para la prueba cerrada, además: el aviso y la página de eliminación publicados, las solicitudes de eliminación activas en staging, la cuenta del revisor, el cuestionario de contenido, Data safety completo y los 12 testers.

---

## 10. Textos de la app frente al aviso `2026-11-03.general.2`

| Tema | Qué dice la app | Qué hace | Qué dice el aviso | Acción |
|---|---|---|---|---|
| Eliminación con el servidor apagado | Antes: error genérico de servidor | 503, sin solicitud registrada | «Puede solicitar la cancelación por el canal de privacidad aunque una opción automática no esté disponible» | **Corregido en este PR** (sección 7) |
| Permiso de cámara | Antes: «…para fotografiar tu identificación y verificar tu identidad» | Credencial, selfie y prueba de vida | Verificación facial y prueba de vida con consentimiento expreso | **Corregido en este PR** (`app.json`). En Android el diálogo del sistema no muestra este texto (solo iOS). En Android lo explica el consentimiento de identidad, que transcribe la finalidad del aviso |
| Ubicación | «…de forma opcional, para ayudar a proteger tu cuenta durante la verificación» | Coordenadas con un botón de consentimiento | Coordenadas de la captura; «se informará su finalidad antes de obtenerla» | Coherente |
| Micrófono | «solo para grabar entrevistas de encuestas…» | Solo el grabador de encuestas; no está en `store-beta` | Grabaciones solo al participar | Coherente |
| Token de push | Preferencias de notificaciones | Token enviado a la API (cifrado) y a Expo/FCM | Solo de forma genérica: «datos técnicos del dispositivo necesarios para operar la función» | Sugerencia para el responsable del aviso: nombrarlo, porque Data safety lo declara |
| Registro asistido (staff) | Captura documentos y ubicación de otra persona | Envía fotos y ubicación de terceros | «No proporcione documentos de terceros sin la base jurídica y el procedimiento correspondiente» | **Decisión de Andrés y legal:** qué procedimiento ampara ese flujo en la prueba de Play |
| Sección electoral | — (la app muestra los campos de la credencial) | La API recibe clave de elector y sección | «…para conteos administrativos agregados, sin inferir preferencias políticas» | Andrés decide cómo declararlo en Data safety (sección 5) |
| Retención | La app no promete plazos | — | Plazos «por categoría» aún sin documentar | No declarar días |

## 11. Acceso de revisores y testers en staging (propuesta; no se crea nada)

**Organización y cuentas** (las crea API, con autorización de Andrés):
- una organización **nueva** de staging solo para Play, con `compliance_config.capture_enabled=false`;
- sin acceso a las organizaciones A ni B, sin documentos reales y sin datos sintéticos de la demo;
- un owner de esa organización cuyo código de afiliado sirva de liga de referido para los testers;
- una **cuenta de revisor** ya afiliada, con correo y contraseña. Su correo debe estar en la lista permitida de staging, para poder verificarlo si hace falta.

**Qué pasa en la app con el SMS apagado y el correo limitado:**

| Paso | Cómo se resuelve | Bloquea |
|---|---|---|
| Registro | Correo o celular más contraseña, y el aviso de privacidad publicado en staging. El SMS automático del registro falla sin enviar | No |
| Inicio de sesión | Correo o celular más contraseña, **sin OTP** (API) | No |
| Verificar el correo | Llega solo si el correo está en la lista permitida (`auth.email_verification`) | **No.** En la app, «Verificar mi cuenta» ofrece «Más tarde» y no hay guardas en la navegación. En la API (`main` `c62d7fe4`, API-51) no hay middleware `verified`: iniciar sesión, unirse e invitar no lo exigen. **Excepción:** un consentimiento como `identity_verification` solo vale con la cuenta «verificada como titular» (`privacy.consent_holder_verification`; por defecto, correo **o** teléfono verificado). No afecta mientras la organización de Play tenga la captura apagada. Si se enciende, los testers necesitarán el correo verificado en la lista permitida, porque el SMS está apagado |
| Verificar el celular | SMS apagado: no hay código | Igual que el correo |
| Recuperar la contraseña | Correo: el reset **no** está en la lista permitida, así que no llega. SMS: apagado | **Sí.** Un tester que olvide su contraseña no puede recuperarla en esta prueba. No consta en la API ninguna vía de restablecimiento por soporte o desde Admin (API-51). Lo decide Andrés: abrir `password_reset` en la lista de staging, avisar a los testers, o crear esa vía |
| Unirse a la organización | Con la liga o el código del owner de la organización de Play | No |
| KYC | La organización tiene la captura apagada: el servidor responde `kyc_unavailable` y la app no pide documentos | No |
| Eliminar la cuenta | El formulario responde 503 y la app remite al canal por correo publicado. La declaración «se puede solicitar» se apoya en ese canal; la de «se eliminan» espera confirmar la operación | No bloquea el uso |

**Qué puede bloquear a un tester nuevo:**
- olvidar la contraseña;
- no recibir la liga de la organización de Play;
- solo si se enciende la captura: no tener el correo verificado.

## Referencias oficiales
- [Requisitos de prueba para cuentas personales nuevas](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Requisitos de nivel de API objetivo](https://support.google.com/googleplay/android-developer/answer/11926878) · [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Compatibilidad con páginas de 16 KB](https://developer.android.com/guide/practices/page-sizes)
- [Requisitos de eliminación de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Sección Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) · [Política de datos del usuario](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Pruebas internas, cerradas y abiertas](https://support.google.com/googleplay/android-developer/answer/9845334)
- [Verificación de desarrolladores de Android](https://developer.android.com/developer-verification): empieza el 30 de septiembre de 2026 en Brasil, Indonesia, Singapur y Tailandia, y se extiende a todo el mundo en 2027. Las apps de Play quedan cubiertas por la cuenta de Play Console.
