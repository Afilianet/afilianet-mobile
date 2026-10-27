import { serverStateOf, type BlockingReason, type PendingAssistedEnrollment } from "../services/assistedQueue";

/** Why a saved assisted enrollment stopped syncing: an organization setting, not a connection problem. */
export function blockedExplanation(reason: BlockingReason): { title: string; description: string } {
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

/** Confirmation text for discarding: says what stays on the server, since discarding only deletes this phone's copy. */
export function discardConfirmation(item: PendingAssistedEnrollment): string {
  const name = `${item.input.first_name} ${item.input.last_name}`.trim();
  switch (serverStateOf(item)) {
    case "not_created":
      return `No se creó ningún registro en la organización. Se borrarán de este teléfono los datos, las fotos y la ubicación guardados de ${name}.`;
    case "created":
      return `El registro de ${name} ya existe en la organización. Descartar solo borra la copia de este teléfono (fotos y ubicación sin enviar); el registro y lo ya enviado se conservan en el servidor.`;
    default:
      return `No pudimos confirmar si el registro de ${name} llegó a crearse en la organización. Descartar solo borra la copia de este teléfono; si se creó, se conserva en el servidor.`;
  }
}
