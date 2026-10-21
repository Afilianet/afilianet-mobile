import { fetchMyPlacementChildren, fetchMySponsored } from "../api/endpoints";
import { isApiError } from "../api/errors";
import { useAuth } from "../auth/AuthContext";
import { useOrganization } from "../state/OrganizationContext";
// Personal affiliate data: never requested when the account has no profile in this organization (API #75).
import { hasPersonalAffiliateAccess } from "../state/membership";
import type { AffiliateProfile, PaginatedResponse } from "../types/api";
import { useApiInfiniteQuery } from "./useApiInfiniteQuery";

/** Each list keeps its own scope: direct sponsored and placement children are never merged. */
export type NetworkSearchScope = "sponsored" | "placement-children";

export const NETWORK_SEARCH_MIN_LENGTH = 2;
export const NETWORK_SEARCH_MAX_LENGTH = 100;

/**
 * The server did not confirm the filter (`meta.search` missing or different
 * from what was asked): an older API that ignores `search` would otherwise
 * return the unfiltered list, which must never be shown as search results.
 */
export class NetworkSearchUnsupportedError extends Error {
  constructor() {
    super("network_search_unsupported");
    this.name = "NetworkSearchUnsupportedError";
  }
}

const FETCHERS: Record<NetworkSearchScope, (page: number, perPage: number, search: string) => Promise<PaginatedResponse<AffiliateProfile>>> = {
  sponsored: fetchMySponsored,
  "placement-children": fetchMyPlacementChildren,
};

const NON_RETRYABLE = new Set(["unauthorized", "forbidden", "validation", "not_found"]);

/**
 * Server-side name search inside ONE direct list (docs/BUSQUEDA_RED_CONTRATO_ES.md).
 * `term` is the debounced, trimmed text; below the minimum length the query
 * is disabled and the caller shows the plain list.
 *
 * The key carries account, organization, scope and term, so a late response
 * for an older term, another list, account or organization can only land in
 * its own cache entry -- never in what is on screen now. Every page must echo
 * exactly this term in `meta.search`, or the whole search is reported as
 * unsupported instead of showing unconfirmed rows.
 */
export function useNetworkSearch(scope: NetworkSearchScope, term: string) {
  const { user } = useAuth();
  const { activeOrganization } = useOrganization();
  const enabled = Boolean(user) && hasPersonalAffiliateAccess(activeOrganization) && term.length >= NETWORK_SEARCH_MIN_LENGTH;
  return useApiInfiniteQuery(
    ["affiliate", scope, "me", activeOrganization?.id, user?.id, "search", term],
    async (page) => {
      const response = await FETCHERS[scope](page, 20, term);
      if (response.meta?.search !== term) throw new NetworkSearchUnsupportedError();
      return response;
    },
    {
      enabled,
      retry: (failureCount, error) => {
        if (error instanceof NetworkSearchUnsupportedError) return false;
        if (isApiError(error) && NON_RETRYABLE.has(error.kind)) return false;
        return failureCount < 2;
      },
    },
  );
}
