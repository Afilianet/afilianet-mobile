import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGeneralNotice, refOf, type NoticeDocument, type StepNoticeRefs, type StepPrivacy } from "../api/privacy";
import { strings } from "../i18n";

export interface StepNoticeItem {
  key: string;
  kind: "general" | "organization";
  title: string;
  /** The organization's name when the step knows it (a referral lookup does not). */
  organizationName?: string;
  document: NoticeDocument;
}

export interface StepNotices {
  status: "loading" | "error" | "ready";
  items: StepNoticeItem[];
  /** Opening a document is optional; it is only remembered to describe what happened. */
  isOpened: (key: string) => boolean;
  markOpened: (key: string) => void;
  /** The explicit, never preselected confirmation, valid only for the exact versions listed. */
  confirmed: boolean;
  setConfirmed: (value: boolean) => void;
  /** Nothing to confirm, or confirmed. */
  canSend: boolean;
  /** Why the step cannot continue (a required document is not published), or null. */
  blockedMessage: string | null;
  /** What the step sends: the refs of exactly the versions listed and confirmed, never of anything else. */
  refs: () => StepNoticeRefs;
  /** The server asked again (409 outdated, 422 privacy_notice): reload what is shown. */
  reload: (options?: { requireGeneral?: boolean }) => void;
}

const keyOf = (document: NoticeDocument) => `${document.version}:${document.content_sha256 ?? ""}`;

/**
 * The notices a registration or join step shows before it is sent (API #91,
 * contract §3-§5). `block` is the step lookup's `privacy` block: undefined on
 * an API without it (nothing is shown or sent, as before), present otherwise.
 *
 * - `general: "always"`: a step that creates an account (sign-up, visitor
 *   join) shows the general notice whenever it is published.
 * - `general: "when-needed"`: joining with a session shows it only when
 *   `needsGeneral` says so (GET /me/privacy) or the server asked for it.
 */
export function useStepNotices(options: {
  enabled: boolean;
  /** Joining an organization: its lookup's block decides. Sign-up has no organization and no block. */
  withOrganization: boolean;
  block?: StepPrivacy | null;
  organizationName?: string;
  general: "always" | "when-needed";
  needsGeneral?: boolean;
}): StepNotices {
  const { enabled, withOrganization, block, organizationName, general } = options;
  const [forceGeneral, setForceGeneral] = useState(false);
  const wantsGeneral = general === "always" || (general === "when-needed" && (Boolean(options.needsGeneral) || forceGeneral));
  // Without a block (an API before #91), a join step stays exactly as before.
  const blockKnown = !withOrganization || Boolean(block);
  const [attempt, setAttempt] = useState(0);
  // The answer for one request only (`key`): a reload or a change of mode shows "loading" until its own answer.
  const [answer, setAnswer] = useState<{ key: string; document?: NoticeDocument | null; failed?: boolean } | null>(null);
  const requestKey = `${attempt}:${wantsGeneral}`;
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  // Bound to the exact versions it was given for: a reloaded or changed notice needs it again.
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || !blockKnown || !wantsGeneral) return;
    let current = true;
    fetchGeneralNotice()
      .then((document) => {
        if (current) setAnswer({ key: requestKey, document });
      })
      .catch(() => {
        if (current) setAnswer({ key: requestKey, failed: true });
      });
    return () => {
      current = false;
    };
  }, [enabled, blockKnown, wantsGeneral, requestKey]);
  const settled = answer?.key === requestKey ? answer : null;
  const generalNotice = settled && !settled.failed ? { document: settled.document ?? null } : null;
  const failed = Boolean(settled?.failed);

  const items: StepNoticeItem[] = [];
  const generalDocument = wantsGeneral ? generalNotice?.document ?? null : null;
  if (generalDocument && refOf(generalDocument)) {
    items.push({ key: keyOf(generalDocument), kind: "general", title: strings.privacyNotices.step.general, document: generalDocument });
  }
  const organizationDocument = withOrganization ? block?.organization_notice ?? null : null;
  if (organizationDocument && refOf(organizationDocument)) {
    items.push({
      key: keyOf(organizationDocument),
      kind: "organization",
      title: strings.privacyNotices.step.organization(organizationName),
      organizationName,
      document: organizationDocument,
    });
  }

  let blockedMessage: string | null = null;
  if (block?.required) {
    if (withOrganization && !block.organization_notice) blockedMessage = strings.privacyNotices.errors.organizationUnavailable;
    else if (wantsGeneral && generalNotice && !refOf(generalNotice.document)) blockedMessage = strings.privacyNotices.errors.generalUnavailable;
  }
  // Sign-up has no block: an unpublished notice is only known from the POST (503).

  const loading = enabled && blockKnown && wantsGeneral && !generalNotice && !failed;
  const status: StepNotices["status"] = loading ? "loading" : failed ? "error" : "ready";

  const markOpened = useCallback((key: string) => {
    setOpened((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  }, []);
  const itemsKey = items.map((item) => item.key).join("|");
  const confirmed = items.length > 0 && confirmedFor === itemsKey;

  const refs = () => {
    const result: StepNoticeRefs = {};
    if (!confirmed) return result;
    for (const item of items) {
      const ref = refOf(item.document);
      if (!ref) continue;
      if (item.kind === "general") result.privacy_notice = ref;
      else result.organization_notice = ref;
    }
    return result;
  };

  const reload = (reloadOptions?: { requireGeneral?: boolean }) => {
    if (!mounted.current) return;
    if (reloadOptions?.requireGeneral) setForceGeneral(true);
    setAttempt((value) => value + 1);
  };

  return {
    status,
    items,
    isOpened: (key) => opened.has(key),
    markOpened,
    confirmed,
    setConfirmed: (value) => setConfirmedFor(value ? itemsKey : null),
    canSend: items.length === 0 || confirmed,
    blockedMessage,
    refs,
    reload,
  };
}
