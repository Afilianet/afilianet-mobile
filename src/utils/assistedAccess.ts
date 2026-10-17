import { formatPhoneForDisplay } from "./phone";

/**
 * How the registered person takes over their own account, by the channels
 * the sponsor captured. Registering never verifies a channel: an email gets
 * an activation link; a phone-only person asks for a recovery code by SMS
 * themselves (nothing is sent at registration).
 */
export function assistedAccessInstructions(contact: { email?: string; phone?: string }): string {
  const phoneSteps = (phone: string) =>
    `en la pantalla de inicio de sesión debe elegir «¿Olvidaste tu contraseña?», luego «Celular», escribir ${formatPhoneForDisplay(phone)} y crear su contraseña con el código que recibirá por SMS.`;
  if (contact.email && contact.phone) {
    return `Recibirá en ${contact.email} un enlace para crear su contraseña. Si prefiere usar su celular, ${phoneSteps(contact.phone)}`;
  }
  if (contact.phone) {
    return `No se le envía ningún mensaje por ahora. Para entrar, ${phoneSteps(contact.phone)}`;
  }
  return `Recibirá en ${contact.email ?? "su correo"} un enlace para crear su contraseña.`;
}

/** Registering is not verifying: say which captured channels still await the person's own confirmation. */
export function assistedVerificationNote(contact: { email?: string; phone?: string }): string {
  if (contact.email && contact.phone) return "Su correo y su celular quedan sin verificar: solo la persona puede confirmarlos desde su cuenta.";
  if (contact.phone) return "Su celular queda sin verificar: solo la persona puede confirmarlo desde su cuenta.";
  return "Su correo queda sin verificar: solo la persona puede confirmarlo desde su cuenta.";
}
