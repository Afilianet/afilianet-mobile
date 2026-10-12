import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useOrganization } from "../../state/OrganizationContext";
import { createFixtureSurveySource } from "./fixtureSource";
import type { SurveySource } from "./source";
import type { SurveyScope } from "./vault";

export { surveysPreviewEnabled } from "./flags";

/** The only source today is sample data; an API-backed one replaces it when the contract exists. */
export const surveySource: SurveySource = createFixtureSurveySource();

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
