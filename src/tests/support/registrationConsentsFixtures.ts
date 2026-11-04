/**
 * Registration consents v1 (API draft, 2026-11-03), SYNTHETIC: every text,
 * version and hash here is fictitious and only follows the agreed shapes.
 * Replace with the API's own JSON once its draft PR serves them.
 */
export const sha = (char: string) => char.repeat(64);

export const IDENTITY = {
  key: "identity_verification",
  title: "Finalidad FICTICIA A",
  text: "Texto FICTICIO de la casilla A (prueba).",
  text_sha256: sha("b"),
  required_for: ["kyc"],
  help: "Ayuda FICTICIA de la casilla A.",
};
export const QUALITY = {
  key: "quality_testing",
  title: "Finalidad FICTICIA B",
  text: "Texto FICTICIO de la casilla B (prueba).",
  text_sha256: sha("c"),
  required_for: [],
  help: null,
};

export function notice(version: string, hash: string, purposes: unknown[] = [IDENTITY, QUALITY]) {
  return {
    scope: "global",
    version,
    controller_name: "Responsable ficticio",
    controller_address: "Domicilio ficticio",
    contact_email: "privacidad@example.test",
    deletion_response_days: 20,
    deletion_response_days_kind: "hábiles",
    sections: [{ title: `Texto de ${version}`, text: "Documento FICTICIO de prueba." }],
    content_sha256: hash,
    classification: { change_class: "initial" },
    summary_of_changes: null,
    purposes,
    simplified_notice: `Resumen FICTICIO de ${version}.`,
  };
}

export const G1 = notice("prueba-general.2", sha("a"));
export const G2 = notice("prueba-general.3", sha("d"), [IDENTITY, { ...QUALITY, text: "Texto FICTICIO nuevo de la casilla B.", text_sha256: sha("e") }]);
export const ref = (document: { version: string; content_sha256: string }) => ({ version: document.version, sha256: document.content_sha256 });

/** The `privacy` block of a 201, as the API reads it back from the database. */
export function recorded(document: { version: string; content_sha256: string }, purposes: { key: string; text_sha256: string; decision?: "granted" | "refused" }[]) {
  return {
    terms_acceptance: null,
    acknowledgements: [{ kind: "general", version: document.version, sha256: document.content_sha256, context: "account_registration" }],
    consents: purposes.map((purpose) => ({
      purpose: purpose.key,
      organization_id: null,
      document: ref(document),
      text_sha256: purpose.text_sha256,
      decision: purpose.decision ?? "granted",
      decided_at: "2026-11-04T10:00:00-06:00",
      context: "account_registration",
      auth_method: "account_password",
    })),
  };
}

/** One purpose of GET /me/privacy, with the v1 fields. */
export function myPrivacy(identity: Record<string, unknown> | null, document = G1) {
  return {
    data: {
      required: true,
      enforce_review: false,
      privacy_notice: {
        current: ref(document),
        change_class: "initial",
        summary_of_changes: null,
        action_required: "none",
        acknowledged_current: true,
        last_acknowledged: null,
        purposes: identity
          ? [{ key: IDENTITY.key, title: IDENTITY.title, text_sha256: IDENTITY.text_sha256, required_for: ["kyc"], decision: null, decided_at: null, ...identity }]
          : [],
      },
      organizations: [],
    },
  };
}
