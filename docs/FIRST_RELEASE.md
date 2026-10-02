# Primera versión de Afilianet

Decisión de producto: 2 de octubre de 2026.

## Alcance

Incluye acceso, verificación de correo, recuperación de contraseña, registro
propio y asistido, verificación de identidad, revisión manual y red de afiliados.
La ubicación es opcional. La prueba de vida requiere conexión.

Ventas, comisiones, monedero y retiros quedan para una actualización posterior.
`src/config/release.ts` mantiene `commerce: false` en todas las compilaciones.
No existe un interruptor remoto que habilite esos módulos en la primera versión.
Las pestañas, tarjetas de Inicio y destinos de notificaciones comerciales quedan
excluidos. Las rutas directas redirigen antes de montar consultas o formularios.
La API conserva sus permisos; esta restricción es de alcance de producto, no una
barrera de seguridad del servidor. El panel existente permanece disponible para
operación interna. Ningún nuevo módulo administrativo condiciona esta salida.

## Compilaciones preparadas

Desde `afilianet-mobile`, después de tener acceso a Expo y credenciales de firma:

| Perfil EAS | Uso | API | Distribución Android |
| --- | --- | --- | --- |
| `staging` | Prueba instalada sin Metro | staging-api.afilianet.mx | APK interno |
| `store-beta` | TestFlight / prueba cerrada de Play | staging-api.afilianet.mx | AAB para tienda |
| `production` | Candidato a publicación pública | api.afilianet.mx | AAB para tienda |

Los dos perfiles de prueba usan el entorno EAS `preview`; producción usa
`production`. Los tres deshabilitan la lectura de dotenv local. No compartir
datos reales de producción con staging. El perfil `store-beta` no es la versión
que se promoverá a producción: hay que compilar y volver a verificar el perfil
`production` contra el entorno definitivo.

Comando de compilación Android interna (PowerShell):

```powershell
npx.cmd eas-cli build --platform android --profile staging
```

Para iOS, una vez disponible la membresía y las credenciales:

```powershell
npx.cmd eas-cli build --platform ios --profile store-beta
```

No se han ejecutado estos builds como parte de este cambio. El comando puede
consumir la cuota de Expo. No hay envío automático a las tiendas.

El hook `eas-build-pre-install` rechaza entornos ausentes, perfiles incompatibles,
URLs inseguras y endpoints de staging/locales en producción. Su éxito solo valida
configuración: no demuestra que el servidor exista ni que la app sea publicable.

## Validación física pendiente

Registrar plataforma, dispositivo, versión de SO, SHA, número de build, resultado
y evidencia sin datos personales para cada recorrido:

1. Instalación limpia, inicio sin error 500, sesión y cierre/reapertura.
2. Alta propia, verificación de correo y recuperación; enlaces caducados y reenvío.
3. Alta asistida: documentos y ubicación pertenecen al nuevo afiliado.
4. Sin conexión: cola cifrada, reintento y ubicación con fecha original; prueba de
   vida solo con conexión. Confirmar que cambiar de usuario no mezcla expedientes.
5. Documentos, prueba de vida, selfie/comparación y aprobación manual. Correo
   verificado no equivale a identidad aprobada; cada afiliado tiene su propio estado.
6. Red, patrocinador, referido y actualización tras aprobar desde el panel.
7. Permisos de cámara/ubicación denegados, mala red, sesión vencida y reintentos.
8. Ausencia de ventas, monedero, comisiones y retiros; tampoco abren por enlaces.
9. Eliminación de cuenta y datos: recorrido completo pendiente de implementar y
   validar, incluyendo cuentas con varias organizaciones y registros asistidos.

## Bloqueos que siguen abiertos

- Primer build y prueba física completa de iOS, especialmente el módulo nativo de
  Face Liveness. Tener código Swift no acredita su compilación ni funcionamiento.
- Eliminación de cuenta dentro de la app y vía web, retención y atención operativa.
- Responsable legal, domicilio, contacto de privacidad y plazos de conservación
  confirmados para publicar avisos y declaraciones de datos veraces.
- Producción desplegada y validada, recuperación de respaldos, secretos, dominio,
  correo y monitoreo; no inferirlo del éxito de staging.
- Credenciales/cuentas de las tiendas, ficha, capturas, soporte y cuenta de revisión.
- Decisión documentada sobre calibración de face match o revisión humana obligatoria
  antes de aprobar automáticamente a usuarios externos.

La matriz vigente del lanzamiento vive en `afilianet-docs/docs/FIRST_RELEASE_2026-10-02.md`.
