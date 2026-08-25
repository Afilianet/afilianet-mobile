import { fetchMyPayouts } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

export function useMyPayouts() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["payouts", "mine", activeOrganization?.id],
    (page) => fetchMyPayouts(page),
    { enabled: Boolean(activeOrganization) },
  );
}
