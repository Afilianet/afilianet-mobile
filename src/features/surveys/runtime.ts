import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useOrganization } from "../../state/OrganizationContext";
import { createApiSurveySource } from "./apiSource";
import { createFixtureSurveySource } from "./fixtureSource";
import type { SurveySource } from "./source";
import type { SurveyScope } from "./vault";

export { surveysPreviewEnabled } from "./flags";

/**
 * afilianet-api's surveys module (feat/survey-module @ aa94798) is not deployed
 * yet, so the default stays the sample-data preview. Set
 * EXPO_PUBLIC_SURVEYS_SOURCE=api once the API is deployed in the target
 * environment; both sources follow the same contract.
 */
export const surveySource: SurveySource =
  process.env.EXPO_PUBLIC_SURVEYS_SOURCE === "api" ? createApiSurveySource() : createFixtureSurveySource();

/**
 * The current account+organization, or null. Every surveys read/write goes
 * through this, so data is always stored, listed and sent under exactly the
 * session that is active right now.
 */
export function useSurveyScope(): SurveyScope | null {
  const { status, user } = useAuth();
  const { activeOrganization } = useOrganization();
  const userId = status === "signedIn" ? user?.id : undefined;
  const organizationId = activeOrganization?.id;
  return useMemo(() => (userId && organizationId ? { userId, organizationId } : null), [userId, organizationId]);
}
