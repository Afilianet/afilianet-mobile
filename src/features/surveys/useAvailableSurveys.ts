import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { affiliateProfilePresence } from "../../state/membership";
import type { Organization } from "../../types/api";
import { canStartInterview } from "./interviewer";
import { cachedInbox, refreshInbox } from "./library";
import { surveySource, useSurveyOrganization, useSurveyScope } from "./runtime";
import type { AvailableSurvey } from "./types";
import { scopeId } from "./vault";

export type AvailableSurveysState =
  | { kind: "loading" }
  | { kind: "ready"; surveys: AvailableSurvey[]; saved: boolean }
  | { kind: "error" };

/**
 * Whether this account can answer the survey here: itself (an affiliate
 * profile in this organization, in any state) or by interviewing (assigned
 * surveyor or staff). The same rules the survey list shows as its modes.
 */
export function canAnswerSurvey(survey: AvailableSurvey, organization: Organization | null): boolean {
  return (survey.allows_self_response && affiliateProfilePresence(organization) !== "absent") || canStartInterview(survey, organization);
}

/**
 * The surveys open right now in the active organization that this account can
 * answer -- GET /surveys/available, which does not depend on a distribution or
 * on a notification having arrived. Asked again each time the screen is shown
 * and when the app returns to the foreground; offline, the list saved on the
 * phone for this organization and server (`saved`).
 */
export function useAvailableSurveys(): AvailableSurveysState {
  const scope = useSurveyScope();
  const organization = useSurveyOrganization();
  const key = scope ? scopeId(scope) : null;
  const current = useRef(key);
  useEffect(() => {
    current.current = key;
  }, [key]);
  const [loaded, setLoaded] = useState<{ key: string; state: AvailableSurveysState } | null>(null);

  const load = useCallback(async () => {
    if (!scope) return;
    const requested = scopeId(scope);
    let state: AvailableSurveysState;
    try {
      state = { kind: "ready", surveys: (await refreshInbox(scope, surveySource)).surveys, saved: false };
    } catch {
      const saved = await cachedInbox(scope, surveySource.origin).catch(() => null);
      state = saved ? { kind: "ready", surveys: saved.surveys, saved: true } : { kind: "error" };
    }
    // Another account or organization by now: never show its list.
    if (requested !== current.current) return;
    setLoaded({ key: requested, state });
  }, [scope]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => subscription.remove();
  }, [load]);

  const state = loaded && loaded.key === key ? loaded.state : { kind: "loading" as const };
  if (state.kind !== "ready") return state;
  return { ...state, surveys: state.surveys.filter((survey) => canAnswerSurvey(survey, organization)) };
}
