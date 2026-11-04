import { useState } from "react";
import {
  IDENTITY_VERIFICATION_PURPOSE,
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
  /** Never blocks creating the account; `quality_testing` is also shown as optional. */
  optional: boolean;
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
 * - `identity_verification` only where the organization verifies identity
 *   (`verificationExpected`); direct sign-up asks for it at KYC start.
 * - `quality_testing` always, as optional.
 *
 * Neither one is ever required to create the account.
 */
export function useRegistrationConsents(notices: StepNotices, options: { verificationExpected: boolean }): RegistrationConsents {
  const [checked, setCheckedKeys] = useState<Set<string>>(() => new Set());
  const general = notices.items.find((item) => item.kind === "general")?.document;
  const items: RegistrationConsentItem[] = [];
  if (general && refOf(general)) {
    const purposes = general.purposes ?? [];
    const identity = purposes.find((purpose) => purpose.key === IDENTITY_VERIFICATION_PURPOSE);
    const quality = purposes.find((purpose) => purpose.key === QUALITY_TESTING_PURPOSE);
    if (identity && options.verificationExpected) {
      items.push({ key: itemKey(general, identity), purpose: identity, document: general, optional: false });
    }
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
