import { lookupAssistedEnrollmentByRequest, type AssistedEnrollmentResult } from "../api/assistedEnrollment";
import { captureApiSessionGuard } from "../api/client";
import { serverStateOf, type BlockingReason, type PendingAssistedEnrollment } from "../services/assistedQueue";

/** Why a saved assisted enrollment stopped syncing: an organization setting, not a connection problem. */
export function blockedExplanation(reason: BlockingReason): { title: string; description: string } {
  if (reason === "assisted_access_claimed") {
    return {
      title: "La persona ya activó su cuenta",
      description: "Ya no es posible capturar por ella desde este teléfono: debe continuar la verificación desde su propia sesión. Lo guardado aquí (fotos y ubicación sin enviar) no se enviará. Puedes revisarlo y descartarlo.",
    };
  }
  if (reason === "kyc_unavailable") {
    return {
      title: "Verificación de identidad pausada en esta organización",
      description: "La organización no está recibiendo fotos de INE ni ubicación. No se volverá a enviar automáticamente; lo guardado sigue cifrado en este teléfono. Puedes descartarlo o reintentar cuando la organización lo reactive.",
    };
  }
  return {
    title: "Registro asistido no disponible en esta organización",
    description: "La organización desactivó el registro asistido. No se volverá a enviar automáticamente; lo guardado sigue cifrado en este teléfono. Puedes descartarlo o reintentar cuando la organización lo reactive.",
  };
}

export type ServerCheck =
  | { kind: "not_needed" }
  | { kind: "found"; enrollment: AssistedEnrollmentResult }
  | { kind: "not_found" }
  | { kind: "unavailable" };

/**
 * Asks the server, read-only, what exists for this draft before discarding
 * (API #92 by-request lookup). Never replays the creation. Only needed once a
 * request left the phone; a timeout, missing permission, older API or a
 * session/organization change since the draft was opened stays uncertain.
 */
export async function checkServerBeforeDiscard(item: PendingAssistedEnrollment): Promise<ServerCheck> {
  if (!item.createAttempted) return { kind: "not_needed" };
  const stillCurrent = captureApiSessionGuard(item.organizationId);
  if (!stillCurrent()) return { kind: "unavailable" };
  try {
    const enrollment = await lookupAssistedEnrollmentByRequest(item.input.client_request_id);
    if (!stillCurrent()) return { kind: "unavailable" };
    return enrollment ? { kind: "found", enrollment } : { kind: "not_found" };
  } catch {
    return { kind: "unavailable" };
  }
}

/** Confirmation text for discarding: says what stays on the server, since discarding only deletes this phone's copy. */
export function discardConfirmation(item: PendingAssistedEnrollment, check: ServerCheck = { kind: "unavailable" }): string {
  const name = `${item.input.first_name} ${item.input.last_name}`.trim();
  const localOnly = `Se borrarán de este teléfono los datos, las fotos y la ubicación guardados de ${name}.`;
  if (check.kind === "found") {
    const state = check.enrollment.access_status === "ready" ? "y la persona ya activó su cuenta" : "y aún no se activa";
    return `El registro de ${name} existe en la organización ${state}. Descartar solo borra la copia de este teléfono (fotos y ubicación sin enviar); el registro y lo ya enviado se conservan en el servidor.`;
  }
  if (check.kind === "not_found") {
    // Not proof it never existed: only that the server holds none for this request now.
    return `El servidor no tiene ahora un registro para esta solicitud. ${localOnly}`;
  }
  // Without a server answer, "nothing was created" is only claimed when no request ever left the phone.
  const state = serverStateOf(item);
  switch (state === "not_created" && item.createAttempted ? "unknown" : state) {
    case "not_created":
      return `No se creó ningún registro en la organización. ${localOnly}`;
    case "created":
      return `El registro de ${name} ya existe en la organización. Descartar solo borra la copia de este teléfono (fotos y ubicación sin enviar); el registro y lo ya enviado se conservan en el servidor.`;
    default:
      return `No pudimos confirmar si el registro de ${name} llegó a crearse en la organización. Descartar solo borra la copia de este teléfono; si se creó, se conserva en el servidor.`;
  }
}
