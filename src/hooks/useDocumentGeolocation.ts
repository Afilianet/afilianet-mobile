import { useRef } from "react";
import { submitComplianceGeolocation } from "../api/endpoints";
import { buildGeolocationSubmission, captureDeviceGeolocation } from "../utils/geolocation";

/**
 * Phase 9F.2: the one entry point for the optional, consented geolocation
 * observation attached to an identity_document capture attempt.
 *
 * NEVER GATES the document flow: both `allow()` and `continueWithoutLocation()`
 * are fire-and-forget from the caller's perspective -- neither one returns a
 * promise the caller needs to await before proceeding, and every failure
 * mode (permission denied, services off, position timeout, or the submit
 * request itself failing/offline/4xx/5xx) is swallowed here, never
 * rethrown. Nothing this hook touches is ever logged (no console, no
 * analytics, no Sentry) -- see captureDeviceGeolocation/
 * buildGeolocationSubmission in utils/geolocation.ts for where the raw
 * coordinates live and stop.
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

  async function submitOnce(run: () => Promise<void>) {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    try {
      await run();
    } catch {
      // Never surfaced -- this observation is a courtesy, not a requirement.
    }
  }

  function allow() {
    void submitOnce(async () => {
      const outcome = await captureDeviceGeolocation();
      const payload = buildGeolocationSubmission(outcome);
      await submitComplianceGeolocation(stepId, payload);
    });
  }

  function continueWithoutLocation() {
    // The affiliate declined at THIS app's own pre-permission screen --
    // the OS permission dialog is never even shown. The backend contract
    // only defines "denied"/"unavailable" for a skipped capture, with no
    // separate "user pre-declined" value, so this reports "denied": the
    // real-world outcome is identical to an OS-level denial (no location
    // was granted or captured), and reusing the closest existing contract
    // value is preferable to inventing a new one.
    void submitOnce(async () => {
      await submitComplianceGeolocation(stepId, { permission_status: "denied", capture_status: "skipped" });
    });
  }

  return { allow, continueWithoutLocation };
}
