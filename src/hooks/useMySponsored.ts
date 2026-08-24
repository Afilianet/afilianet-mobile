import { fetchMySponsored } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

export function useMySponsored() {
  const { activeOrganization } = useOrganization();
  return useApiInfiniteQuery(
    ["affiliate", "sponsored", "me", activeOrganization?.id],
    (page) => fetchMySponsored(page),
    { enabled: Boolean(activeOrganization) },
  );
}
