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

**Regla:** una versión de staging nunca se promueve a producción. Producción usa un AAB propio del perfil `production`, con un versionCode mayor.

---

## 2. Candidato y perfil AAB

### Producción: hoy no es posible
- `production` (AAB, entorno EAS `production`) **falla cerrado**. `check-build-env` lo rechaza hoy por tres motivos, comprobado en `297f5b0`:
  - falta `EXPO_PUBLIC_API_BASE_URL`, porque no existe API de producción: `api.afilianet.mx` no resuelve (Infra, HOY);
  - falta `EXPO_PUBLIC_REFERRAL_LANDING_URL`;
  - falta `GOOGLE_SERVICES_JSON` en el entorno EAS `production`.
- Detalle: [`PERFIL_PRODUCCION_ES.md`](PERFIL_PRODUCCION_ES.md).

### Prueba interna y cerrada: `store-beta` desde `297f5b0`

| | Valor |
|---|---|
| Commit | `297f5b0ea8021ef01e646ebbb77fadb087c54e38` (#94 ⊃ #93 ⊃ #92), el mismo código que vc21 |
| Perfil | `store-beta`, que genera un **AAB** (`app-bundle`), distribución `store` y entorno EAS `preview` |
| API | `https://staging-api.afilianet.mx`, la que exige `check-build-env` |
| Paquete | `com.afilianet.mobile`, sin cambios |
| versionCode | El remoto está en 21, así que el AAB sería el **22** |
| Funciones | Encuestas y audio **apagados** (`SURVEYS_PREVIEW=0`, sin `RECORD_AUDIO`); WhatsApp **sin definir**, así que solo SMS; comercio (ventas, monedero y pagos) **oculto** (`releaseFeatures.commerce=false`); Sentry y PostHog **apagados** |
| SDK | `targetSdk` 36 y `minSdk` 24, comprobado en vc21. Play exige el 36 desde el 31 de agosto de 2026 ([target API](https://support.google.com/googleplay/android-developer/answer/11926878)) |
| 16 KB | Las 31 librerías arm64 de vc21 tienen alineación ELF ≥ 16 KB y están alineadas en el ZIP ([16 KB](https://developer.android.com/guide/practices/page-sizes)) |

- **No es vc21.** vc21 es `demo-apk`: un APK con encuestas reales y WhatsApp permitido. Play recibe un AAB `store-beta` del mismo commit.
- **Consecuencia:** los testers de Play usan **staging**. Sus cuentas, datos y constancias quedan en staging y no pasan a producción.

### Firma: decisión de Andrés antes de la primera subida

Las apps nuevas en Play usan **Play App Signing**:
- la **clave de firma de la app** la guarda Google;
- el desarrollador firma con una **clave de subida**.

La decisión se toma al subir el primer AAB y **no se puede deshacer** para la clave de firma.

| Opción | Qué pasa | Consecuencias |
|---|---|---|
| **A. Google genera la clave de firma** (recomendada) | El almacén de EAS (`5d3974b9…6320ca`, el de vc12 a vc21) pasa a ser la **clave de subida**. No se exporta nada | Lo instalado desde Play lleva otro certificado que los APK instalados a mano (vc12–vc21). **No se actualizan entre sí:** para pasar de un APK a Play, o al revés, hay que desinstalar, y se pierden la sesión, los borradores y el outbox. El A06 se queda con su APK; la prueba en Play se hace en otros teléfonos |
| B. Subir la clave de EAS como clave de firma | Hay que exportar el almacén de EAS y cifrarlo con la herramienta de Google. **Es una operación de credenciales:** requiere autorización expresa | Play y los APK quedan con la misma firma y se actualizan entre sí. A cambio, la clave que ya se usó para distribuir APK fuera de Play se vuelve la de producción |

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
| **Política de privacidad (URL)** | `https://afilianet.mx/privacidad` responde 200, **pero hoy es un marcador**: «Contenido pendiente de aprobación… El texto oficial de este documento aún no está publicado.» | **Bloquea.** Hay que publicar el aviso vigente (`2026-11-03.general.2`) en esa URL y que Andrés confirme que es la definitiva (decisión P6 de la API) |
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

**Datos que la app recoge y envía a la API.** En Play, enviarlos a proveedores que procesan por cuenta propia de Afilianet (AWS, Expo/FCM) **no** cuenta como «compartir».

| Categoría de Play | Dato | ¿Opcional? | Fin | Notas |
|---|---|---|---|---|
| Información personal → Nombre | Nombre y apellidos | No | Gestión de la cuenta | |
| Información personal → Correo | Correo | Correo o celular | Cuenta y verificación | |
| Información personal → Teléfono | Celular | Correo o celular | Cuenta y verificación por SMS | |
| Información personal → ID de usuario | ID de la cuenta | No | Cuenta | |
| Información personal → Dirección | Domicilio leído de la credencial | Solo si la organización pide KYC | Verificación de identidad | Lo extrae el servidor de la foto (API-51) |
| Información personal → Otra información | CURP, clave de elector, fecha de nacimiento, sexo, entidad y sección | Solo con KYC | Verificación de identidad | Ver el tema sensible de la sección 5 |
| Fotos y videos → Fotos | Frente y reverso de la credencial, y selfie | Solo con KYC | Verificación de identidad y prevención de fraude | Subida con URL prefirmada |
| Fotos y videos → Videos | Prueba de vida (AWS Rekognition Face Liveness, SDK Amplify UI) | Solo con KYC | Verificación de identidad y prevención de fraude | Se envía directo a AWS con credenciales temporales |
| Ubicación → Precisa | Coordenadas (precisión `Balanced`) | **Sí** | Prevención de fraude en la verificación | Opcional; con `Balanced` es «precisa» según la definición de Play (< 3 km²) |
| Contactos u otra información de terceros | Correo o celular de quien se invita; fotos y ubicación de terceros en el registro asistido (staff) | Sí | Invitaciones y registro asistido | Hay que declararlo: son datos de otras personas |
| ID de dispositivo u otros | Token de push (Expo/FCM) | Sí (con el permiso de notificaciones) | Notificaciones | Cifrado en la API y borrado al cerrar sesión |
| Información y rendimiento de la app | — | — | — | **No se recoge:** Sentry apagado |
| Audio | — | — | — | **No se recoge en este build** (sin `RECORD_AUDIO`) |
| Información financiera | — | — | — | **No se recoge en este build** (comercio oculto) |

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

| Requisito | Estado |
|---|---|
| Opción en la app | **Hecha:** Perfil → «Administrar mi cuenta» → «Eliminar mi cuenta». Pide la contraseña y escribir ELIMINAR, y muestra el folio (`delete-account.tsx`, desde 0190e68) |
| El servidor la acepta | **No:** `PRIVACY_DELETION_REQUESTS_ENABLED` no está definida en staging (vale false), así que responde 503 «no disponible por el momento». Lo decide Andrés; lo ejecuta API o Infra |
| Página web | `https://afilianet.mx/eliminar-cuenta` responde 200, **pero es un marcador** («El texto oficial… aún no está publicado»). No describe cómo pedirla ni qué se borra. Tiene que publicarse el procedimiento real |
| Vía web sin la app | La API tiene `POST /api/v1/privacy/deletion-requests` (correo, contraseña y ELIMINAR), pero no un formulario HTML, y hoy responde 503. La página puede ofrecer un formulario que llame a esa API, o un correo con un procedimiento descrito. Decide Andrés. Una cuenta sin contraseña no puede usar la vía de la API |
| Qué pasa después | Plazo de 20 días hábiles, más 15 para hacerlo efectivo (aviso 2026-11-03). Lo ejecuta un operador; no hay borrado automático. Se conserva el folio (36 meses) y los respaldos hasta 90 días. Lo financiero, ser owner o superadmin y las encuestas pasan a revisión manual. Los docs de la API dicen «no publicar como servicio de eliminación terminado»: hay que alinear el texto de la página con eso |

### Aviso de privacidad
- El vigente en staging es `2026-11-03.general.2` (API). Responsable: LUNI LABS SAPI DE CV. Contacto: `servicioalcliente@afilianet.mx`.
- Falta:
  - publicarlo en `https://afilianet.mx/privacidad`;
  - confirmar que esa es la URL definitiva;
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
4. Crear la app en Play Console (sección 3, pasos 1–3). La política de privacidad puede esperar a la prueba cerrada si Play Console lo permite; Play muestra en su **Panel** las tareas que exige para cada pista.

Después, lo que Mobile ejecuta solo con autorización en su sesión:
5. Autorizar **un** build AAB:
   - perfil `store-beta`, desde `297f5b0ea8021ef01e646ebbb77fadb087c54e38`;
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

## Referencias oficiales
- [Requisitos de prueba para cuentas personales nuevas](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Requisitos de nivel de API objetivo](https://support.google.com/googleplay/android-developer/answer/11926878) · [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Compatibilidad con páginas de 16 KB](https://developer.android.com/guide/practices/page-sizes)
- [Requisitos de eliminación de cuenta](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Sección Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) · [Política de datos del usuario](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Pruebas internas, cerradas y abiertas](https://support.google.com/googleplay/android-developer/answer/9845334)
- [Verificación de desarrolladores de Android](https://developer.android.com/developer-verification): empieza el 30 de septiembre de 2026 en Brasil, Indonesia, Singapur y Tailandia, y se extiende a todo el mundo en 2027. Las apps de Play quedan cubiertas por la cuenta de Play Console.
