/**
 * Afilianet's public privacy destinations, fixed (Andrés, 2026-11-10). They work
 * without a session and without the API: Google Play requires that deletion can
 * be requested from the app, and the published page describes the email channel.
 *
 * Never add tokens, account data or anything personal to these URLs or to the
 * email draft: it carries only the agreed subject.
 */
export const PUBLIC_PRIVACY_URL = "https://afilianet.mx/privacidad";
export const PUBLIC_DELETION_URL = "https://afilianet.mx/eliminar-cuenta";
export const PRIVACY_CONTACT_EMAIL = "servicioalcliente@afilianet.mx";
export const PRIVACY_MAIL_SUBJECT = "Privacidad Afilianet";

export const PRIVACY_MAILTO = `mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent(PRIVACY_MAIL_SUBJECT)}`;
