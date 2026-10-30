# Activar push en Afilianet: preparación y prueba

El código ofrece Perfil → Configurar notificaciones y Perfil → Salir de [organización]. La campana abre solo la bandeja y el detalle de cada notificación; la configuración push está únicamente en Perfil. Avisos operativos habilitados como preferencia inicial; el permiso del sistema sigue siendo necesario. Promociones apagadas hasta aceptación explícita, independiente por organización. Las campañas del panel permanecen bloqueadas mientras PUSH_ENABLED=false.

## Android, sin publicar todavía en Google Play

1. Abre https://console.firebase.google.com/ y utiliza el proyecto de Afilianet (créalo si aún no existe). Agrega una aplicación Android con paquete exacto `com.afilianet.mobile`.
2. En Configuración del proyecto → General → Tus apps, descarga **google-services.json**.
3. Abre el proyecto **afilianet-mobile** en https://expo.dev/. En Environment variables, crea `GOOGLE_SERVICES_JSON`, tipo **File**, entorno **preview**, y sube google-services.json. El proyecto Expo esperado tiene ID `5675cfc3-13b6-425d-92bc-0d6067845ed0`. app.config.js ya conecta esta variable con la configuración Android.
4. En Firebase → Configuración del proyecto → Cuentas de servicio, genera/descarga una clave JSON para FCM. Esta clave privada es distinta de google-services.json: se configura en credenciales de Expo, nunca dentro de la app.
5. En Expo → Project settings → Credentials → Android → `com.afilianet.mobile` → Service credentials → **FCM V1 service account key**, carga la clave de servicio. También se puede hacer con `npx eas-cli credentials -p android`, seleccionando el perfil staging y la opción de Push Notifications (FCM V1).
6. Después de integrar los cambios, abre una terminal en tu copia de **afilianet-mobile** y ejecuta:

   ```sh
   git switch main
   git pull --ff-only
   npm ci
   npx eas-cli login
   npx eas-cli build --platform android --profile staging
   ```

   Si git detecta cambios locales, conserva esos cambios antes de actualizar; no uses reset ni force. El perfil staging usa https://staging-api.afilianet.mx y genera APK instalable sin publicar en tienda. No uses el perfil development: apunta a una API local.
7. Instala el APK del enlace que entregue Expo en un Android físico. Es una nueva compilación; actualizar solo JavaScript no instala los componentes nativos de notificaciones.
8. Cuando las credenciales y el APK estén listos, corresponde a ingeniería activar push en staging, verificar proveedor/aviso/scheduler y probar con una organización sintética. Antes de esa activación, el botón mostrará que push sigue en preparación.

## iPhone

Con membresía Apple Developer activa, ejecuta `npx eas-cli credentials -p ios` y configura una clave APNs para `com.afilianet.mobile`. Para distribución interna registra el iPhone mediante `npx eas-cli device:create`, luego `npx eas-cli build --platform ios --profile staging`. Si se usa TestFlight, compila con `--profile store-beta` y completa App Store Connect; es un flujo distinto de instalación interna. Sin acceso Apple Developer, avanza primero con Android.

## Prueba, solo después de habilitar staging

- Entrar a Perfil → Configurar notificaciones → Activar en este teléfono y aceptar permiso del sistema. Probar también permiso denegado: la app debe seguir funcionando.
- Confirmar avisos activados y promociones apagadas. Activar promociones solo en una organización, pulsar Guardar preferencias, cambiar de organización y comprobar que no se copiaron.
- Usar cuentas y organizaciones sintéticas. Desde el panel, seleccionar la organización/red, escribir un mensaje de prueba, revisar audiencia y confirmar. No utilizar una red real para estas pruebas.
- Probar app abierta, cerrada y segundo plano; tocar el mensaje debe abrir la bandeja de Notificaciones en la organización correspondiente, sin marcar nada como leído (la push no trae id de notificación).
- Abrir la bandeja no cambia el contador. Abrir el detalle de una notificación no leída la marca como leída una sola vez; "Marcar todo como leído" es la única acción que marca todas.
- Si al tocar la push falla el cambio de organización, la apertura se reintenta al volver a la app. Si se cierra sesión antes, no se abre nada en la siguiente sesión.
- Desactivar promociones, guardar y comprobar exclusión en la siguiente campaña. Cerrar sesión debe retirar el dispositivo de esa sesión.
- Crear una cadena sintética A → B → C. Desde la cuenta B, Perfil → Salir de la organización → contraseña → SALIR. Confirmar C → A y que la afiliación de B en otra organización permanece. Si A está inactivo, se busca el siguiente superior activo; si no existe, C queda raíz.
- La baja de organización no borra la cuenta ni sus registros históricos. Eliminar mi cuenta es otra acción y conserva su procedimiento de privacidad.

Fuentes: https://docs.expo.dev/push-notifications/fcm-credentials/ · https://docs.expo.dev/push-notifications/push-notifications-setup/ · https://docs.expo.dev/eas/environment-variables/
