/**
 * Spanish (Mexican) strings -- the app's DEFAULT language (see index.ts).
 * Natural, concise, friendly, professional tone; never overly technical.
 *
 * Scope note: this dictionary currently covers auth, navigation, the
 * Compliance overview screen, and compliance/step status copy -- the areas
 * translated so far (see git history for the exact reasoning: several other
 * screens/components share atoms like RetryButton/EmptyState/ErrorState or
 * status-mapping entries whose default English text is asserted by test
 * files spanning many unrelated screens, so those were deliberately left
 * for a follow-up pass rather than risking a wide, hard-to-verify test
 * rewrite in one change). Extend this file's shape (and en.ts's matching
 * shape) as more screens are migrated -- never invent a new structure per
 * screen.
 */
export const es = {
  common: {
    close: "Cerrar",
  },
  nav: {
    home: "Inicio",
    network: "Red",
    sales: "Ventas",
    wallet: "Monedero",
    profile: "Perfil",
  },
  app: {
    startingUp: "Iniciando...",
  },
  auth: {
    login: {
      subtitle: "Inicia sesión en tu cuenta",
      emailLabel: "Correo electrónico",
      passwordLabel: "Contraseña",
      submit: "Iniciar sesión",
    },
  },
  compliance: {
    screenTitle: "Verificación",
    verificationStatusA11y: (label: string) => `Estado de verificación: ${label}`,
    stepTypeLabels: {
      identity_information: "Información de identidad",
      identity_document: "Documento de identidad",
      biometric_liveness: "Prueba de vida",
      face_match: "Coincidencia facial",
      verbal_consent: "Consentimiento verbal",
      terms_acceptance: "Aceptación de términos",
    },
    joinAffiliateProgram: {
      title: "Únete al programa de afiliados",
      description: "Necesitas un perfil de afiliado en esta organización antes de continuar con tu verificación.",
    },
    noRequiredSteps: {
      title: "No hay pasos requeridos",
      description: "Esta organización no ha configurado pasos de verificación requeridos.",
    },
    startVerification: "Comenzar verificación",
    requiredSteps: "Pasos requeridos",
    nextStep: (label: string) => `Siguiente: ${label}`,
    expiredOn: (date: string) => `Venció el ${date}`,
    approvedOn: (date: string) => `Aprobado el ${date}`,
    completedOn: (date: string) => `Completado el ${date}`,
    couldNotLoadSteps: "No pudimos cargar tus pasos requeridos.",
    genericError: "Algo salió mal. Inténtalo de nuevo.",
    stepA11y: (label: string, statusLabel: string, completedOn: string | null) =>
      `${label}, ${statusLabel}${completedOn ? `, completado el ${completedOn}` : ""}`,
    status: {
      not_started: { label: "No iniciado", description: "Completa tu verificación para desbloquear todas las funciones de afiliado." },
      in_progress: { label: "En progreso", description: "Verificación en progreso." },
      pending_review: { label: "Revisión pendiente", description: "Estamos revisando tu información." },
      manual_review: { label: "Revisión manual", description: "Tu verificación necesita revisión manual." },
      approved: { label: "Aprobado", description: undefined as string | undefined },
      rejected: { label: "Rechazado", description: "Tu verificación fue rechazada y necesita atención." },
      expired: { label: "Vencido", description: "Tu verificación venció." },
    },
    stepStatus: {
      pending: "Pendiente",
      in_progress: "En progreso",
      passed: "Aprobado",
      failed: "Rechazado",
      manual_review: "Revisión manual",
      skipped: "Omitido",
    },
  },
} as const;
