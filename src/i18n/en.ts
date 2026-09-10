/**
 * English strings -- NOT currently active (see index.ts: Spanish is the
 * default). Kept as an exact structural mirror of es.ts (same keys, same
 * function signatures) so a future locale switch only needs to pick which
 * of these two objects `strings` resolves to -- never a parallel shape.
 */
export const en = {
  common: {
    close: "Close",
  },
  nav: {
    home: "Home",
    network: "Network",
    sales: "Sales",
    wallet: "Wallet",
    profile: "Profile",
  },
  app: {
    startingUp: "Starting up...",
  },
  auth: {
    login: {
      subtitle: "Sign in to your account",
      emailLabel: "Email",
      passwordLabel: "Password",
      submit: "Sign in",
    },
  },
  compliance: {
    screenTitle: "Compliance",
    verificationStatusA11y: (label: string) => `Verification status: ${label}`,
    stepTypeLabels: {
      identity_information: "Identity information",
      identity_document: "Identity document",
      biometric_liveness: "Liveness check",
      face_match: "Face match",
      verbal_consent: "Verbal consent",
      terms_acceptance: "Terms acceptance",
    },
    joinAffiliateProgram: {
      title: "Join the affiliate program",
      description: "You need an affiliate profile in this organization before verification applies to you.",
    },
    noRequiredSteps: {
      title: "No required steps",
      description: "This organization hasn't configured any required verification steps.",
    },
    startVerification: "Start verification",
    requiredSteps: "Required steps",
    nextStep: (label: string) => `Next: ${label}`,
    expiredOn: (date: string) => `Expired ${date}`,
    approvedOn: (date: string) => `Approved ${date}`,
    completedOn: (date: string) => `Completed ${date}`,
    couldNotLoadSteps: "Couldn't load your required steps.",
    genericError: "Something went wrong. Please try again.",
    stepA11y: (label: string, statusLabel: string, completedOn: string | null) =>
      `${label}, ${statusLabel}${completedOn ? `, completed ${completedOn}` : ""}`,
    status: {
      not_started: { label: "Not started", description: "Complete your verification to unlock full affiliate features." },
      in_progress: { label: "In progress", description: "Verification in progress." },
      pending_review: { label: "Pending review", description: "We're reviewing your submission." },
      manual_review: { label: "Manual review", description: "Your verification needs manual review." },
      approved: { label: "Approved", description: undefined as string | undefined },
      rejected: { label: "Rejected", description: "Your verification was rejected and needs attention." },
      expired: { label: "Expired", description: "Your verification has expired." },
    },
    stepStatus: {
      pending: "Pending",
      in_progress: "In progress",
      passed: "Passed",
      failed: "Failed",
      manual_review: "Manual review",
      skipped: "Skipped",
    },
  },
} as const;
