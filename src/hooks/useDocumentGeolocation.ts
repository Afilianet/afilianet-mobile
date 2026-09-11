import { useRef } from "react";
import { submitComplianceGeolocation } from "../api/endpoints";
import { buildGeolocationSubmission, captureDeviceGeolocation } from "../utils/geolocation";

/**
 * Phase 9F.2: the one entry point for the optional, consented geolocation
 * observation attached to an identity_document capture attempt.
 *
 * NEVER GATES the document flow: `allow()` is fire-and-forget from the
 * caller's perspective -- it doesn't return a promise the caller needs to
 * await before proceeding, and every failure mode (permission denied,
 * services off, position timeout, or the submit request itself failing/
 * offline/4xx/5xx) is swallowed here, never rethrown. Nothing this hook
 * touches is ever logged (no console, no analytics, no Sentry) -- see
 * captureDeviceGeolocation/buildGeolocationSubmission in
 * utils/geolocation.ts for where the raw coordinates live and stop.
 *
 * "Continue without location" is deliberately NOT exposed here at all: the
 * affiliate declining at this app's OWN pre-permission screen never
 * touches the OS permission system and submits NOTHING -- there is no
 * "user pre-declined" value in the backend contract, and fabricating
 * permission_status="denied" would misrepresent an OS-level denial that
 * never happened. Absence of a geolocation observation for that capture
 * attempt IS the signal that the affiliate chose not to participate; the
 * caller (DocumentGeolocationConsent) handles that path by simply calling
 * `onDone()` without invoking anything on this hook.
 *
 * DEDUPLICATION: `hasSubmittedRef` guards against a double-tap firing two
 * submissions for the same attempt (belt-and-suspenders on top of the
 * caller disabling its own buttons after the first tap). This hook holds no
 * other state, so remounting it (the caller keys its consent screen by
 * attempt so a retry gets a fresh instance) is exactly what allows a NEW
 * attempt to submit a new observation -- there is no cross-attempt
 * deduplication by design, matching the backend's own "retries create
 * additional observations" contract.
 */
export function useDocumentGeolocation(stepId: string) {
  const hasSubmittedRef = useRef(false);

  function allow() {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    void (async () => {
      try {
        const outcome = await captureDeviceGeolocation();
        const payload = buildGeolocationSubmission(outcome);
        await submitComplianceGeolocation(stepId, payload);
      } catch {
        // Never surfaced -- this observation is a courtesy, not a requirement.
      }
    })();
  }

  return { allow };
}
