# Verificación del celular por WhatsApp: ronda física única

## Qué cambia en Mobile (este PR, sobre #68)

En «Verificar mi cuenta», la tarjeta **Celular** pregunta «¿Cómo quieres recibir el código?» y ofrece **SMS** (la opción por defecto) o **WhatsApp**.

**Contrato de API #79** (`feat/phone-otp-whatsapp-channel` @ `bad03c0`):
- La app envía `POST /auth/phone-verification {channel}`.
- Un **202 solo significa que el envío quedó en cola**. La pantalla dice «Pedimos el envío…», nunca «te llegó».
- El canal que se muestra es **el que responde la API**.
  - Una API sin #79 ignora el canal y solo envía SMS.
  - En ese caso la pantalla dice SMS y lo explica.

**Espera:**
- Hay **una sola espera para SMS y WhatsApp**: la del `retry_after` de la API, en el 202 y en el 429. En un 429 se usa el cuerpo y, si falta, la cabecera `Retry-After`.
- Si la API no da espera, no se inventa ninguna.
- Puedes cambiar de canal en cualquier momento, pero el botón queda bloqueado hasta que termine la espera.

**Sin cambio automático de canal:**
- Si WhatsApp no está disponible (503 `whatsapp_unavailable`), la app **no pide un SMS por su cuenta**.
- Dice que no se envió ningún código y sugiere SMS. Si los dos canales fallan, lo dice.
- Tras un 503, la API puede responder 429 si se repite en menos de un minuto. La pantalla muestra esa espera.

**Mensajes distintos para cada caso:**
- código incorrecto;
- código vencido;
- intentos agotados;
- límite de solicitudes;
- sin conexión;
- canal no disponible;
- servicio de comprobación no disponible (503 al verificar). En este caso el código sigue escrito.

**«Verificado» solo cuando lo dice el servidor:**
- Aparece únicamente cuando `GET /me` trae `phone_verified_at`.
- Si la API acepta el código pero `/me` aún no lo muestra, o no hay conexión, la tarjeta sigue en «Pendiente» y ofrece **«Comprobar estado»**.

**Cambio de cuenta:**
- Las respuestas que llegan después de cambiar de cuenta o cerrar sesión se descartan.

**Privacidad:**
- Mobile no registra el código ni el número completo; en pantalla solo se ve `•••• 1234`.

**Disponibilidad (#67) sin cambios:**
- La verificación es de la **cuenta**, no de la organización: no se envía `X-Organization-ID`.
- Perfil sigue mostrando «Verificar mi cuenta» con las mismas reglas.

## Antes de empezar (decisiones aparte, no incluidas en este PR)

- **API #79 desplegada en staging,** con WhatsApp habilitado y la plantilla de Meta aprobada. Hoy staging no tiene WhatsApp habilitado: sin eso, el paso 2 mostrará «Por ahora no podemos enviar códigos por WhatsApp…». En ese caso, anótalo y detente.
- **Metro sirviendo este candidato,** con autorización explícita. Hoy Metro sirve #67, y este PR no lo cambia.
- **Cuenta:** una cuenta de prueba con el **celular pendiente de verificar**, que sea un teléfono con WhatsApp que tengas en la mano.
  - Una cuenta ya verificada responde «Tu celular ya está verificado.» y no sirve para esta ronda.
  - Verificar el celular cambia `phone_verified_at` de esa cuenta. **Usar la cuenta de Andrés requiere su visto bueno.**

**Reglas:**
- Se pide **un solo código real por WhatsApp**.
- No se reenvía a terceros.
- El código no se escribe en notas ni se comparte en capturas: recórtalo.

## Pasos

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Perfil → «Verificar mi cuenta» | Tarjeta Celular «Pendiente», número `+52 …` y «¿Cómo quieres recibir el código?» con **SMS** marcado |
| 2 | Elegir **WhatsApp** → «Enviar código por WhatsApp». Anota la hora | «Pedimos el envío de un código por WhatsApp al •••• NNNN…», «El código vence en 10 min.», «Podrás pedir otro código en 60 s» y «La espera es la misma para SMS y WhatsApp.» Sigue «Pendiente» |
| 3 | Durante la espera, elegir **SMS** | «Pedir otro código por SMS» aparece **deshabilitado**. No toques nada más: no se pide nada |
| 4 | Recibir el mensaje en WhatsApp | Anota la hora de llegada y el remitente. Comprueba que el texto es la plantilla de Afilianet con un código de 6 dígitos |
| 5 | Escribir **000000** → «Verificar celular» | «El código no es correcto. Revísalo e inténtalo de nuevo.» Sigue «Pendiente». Usa un solo intento fallido |
| 6 | Escribir el código real → «Verificar celular» | «**Verificado**» y «Tu celular quedó verificado.» Si aparece «Comprobar estado», tócalo una vez y anota el resultado |
| 7 | Salir y volver a «Verificar mi cuenta» (o Perfil) | El celular sigue «Verificado»; ya no se ofrece «Verificar mi cuenta» si el correo también lo está |

**Anotar por paso:** hora, captura (sin el código) y el texto exacto de cualquier mensaje en rojo.

**Si el WhatsApp no llega en 10 minutos:** anota «202 aceptado, no entregado». No lo marques como fallo de Mobile: el 202 solo confirma que quedó en cola. Después, revisa la entrega en Meta y en la API.
