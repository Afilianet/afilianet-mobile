import { useState } from "react";
import {
  QUALITY_TESTING_PURPOSE,
  refOf,
  type NoticeDocument,
  type NoticePurpose,
  type StepConsent,
} from "../api/privacy";
import type { StepNotices } from "./useStepNotices";

export interface RegistrationConsentItem {
  /** Bound to the exact document and text shown: a reloaded or changed text starts unticked again. */
  key: string;
  purpose: NoticePurpose;
  document: NoticeDocument;
  /** Never blocks creating the account. */
  optional: true;
}

export interface RegistrationConsents {
  items: RegistrationConsentItem[];
  isChecked: (key: string) => boolean;
  setChecked: (key: string, value: boolean) => void;
  /** What the step sends: `granted` for each ticked box, nothing for an unticked one (contract v1, Q4). */
  consents: () => StepConsent[];
}

const itemKey = (document: NoticeDocument, purpose: NoticePurpose) =>
  `${document.version}:${document.content_sha256 ?? ""}:${purpose.key}:${purpose.text_sha256 ?? purpose.text}`;

/**
 * The purpose boxes of an account-creating step (registration consents v1),
 * read from the general notice the step already shows. Nothing is invented:
 * a notice without these purposes shows no box and sends nothing, as before.
 *
 * Only `quality_testing`, always optional. `identity_verification` is never
 * asked here, not even where the organization verifies identity: it is its
 * own decision, taken at verification start (IdentityConsentGate), where the
 * API requires it (privacy.consent middleware). The API never requires any
 * purpose to create the account.
 */
export function useRegistrationConsents(notices: StepNotices): RegistrationConsents {
  const [checked, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const general = notices.items.find((item) => item.kind === "general")?.document;
  const items: RegistrationConsentItem[] = [];
  if (general && refOf(general)) {
    const purposes = general.purposes ?? [];
    const quality = purposes.find((purpose) => purpose.key === QUALITY_TESTING_PURPOSE);
    if (quality) items.push({ key: itemKey(general, quality), purpose: quality, document: general, optional: true });
  }

  const isChecked = (key: string) => checked.has(key) && items.some((item) => item.key === key);

  return {
    items,
    isChecked,
    setChecked: (key, value) =>
      setCheckedKeys((previous) => {
        const next = new Set(previous);
        if (value) next.add(key);
        else next.delete(key);
        return next;
      }),
    consents: () => {
      // A consent names a document presented in the same request: without the confirmed notice, none.
      if (!notices.confirmed) return [];
      return items.flatMap((item) => {
        const document = refOf(item.document);
        return document && isChecked(item.key) ? [{ document, purpose: item.purpose.key, decision: "granted" as const }] : [];
      });
    },
  };
}
