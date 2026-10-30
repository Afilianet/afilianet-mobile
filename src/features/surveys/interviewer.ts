import { isOrganizationStaff } from "../../state/membership";
import type { Organization } from "../../types/api";
import type { AvailableSurvey } from "./types";

/**
 * Whether this account may start an interview for a survey in the active
 * organization -- the same rule the API enforces on submit
 * (SurveyResponseController::store @ b3175c84): an assigned surveyor, OR
 * organization staff (an active owner/admin/manager membership; staff need no
 * affiliate profile). `/surveys/available` only reports the first part
 * (`is_assigned_surveyor`, which requires an affiliate profile), so staff
 * would otherwise be told they are not authorized while the API accepts them.
 *
 * If the role on the phone is out of date, the API still decides: a refused
 * submission is kept and shown blocked (403), never lost.
 */
export function canStartInterview(
  survey: Pick<AvailableSurvey, "allows_interview_response" | "is_assigned_surveyor"> | null | undefined,
  organization: Pick<Organization, "my_role" | "my_membership_status"> | null | undefined,
): boolean {
  if (!survey?.allows_interview_response) return false;
  if (survey.is_assigned_surveyor) return true;
  return isOrganizationStaff(organization);
}
