import { CancelledError, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { captureApiSessionGuard } from "../api/client";
import { fetchNotifications } from "../api/endpoints";
import { useOrganization } from "../state/OrganizationContext";
import type { Notification, PaginatedResponse } from "../types/api";
import { useApiQuery } from "./useApiQuery";

// The API's own per_page cap. MAX_PAGES bounds a lookup for an id that is
// far down a very long inbox; past it the result is "not located", never
// "does not exist".
const PER_PAGE = 100;
const MAX_PAGES = 20;

/**
 * - `found`: the notification, straight from the API.
 * - `absent`: every page was read and the id is not there (deleted, another
 *   organization's, or never existed).
 * - `not_located`: the bounded search ended before the last page.
 * A failed request is none of these: it surfaces as the query's error.
 */
export type NotificationLookup =
  | { kind: "found"; notification: Notification }
  | { kind: "absent" }
  | { kind: "not_located" };

/**
 * afilianet-api has no single-notification GET, so one notification is
 * resolved by paging GET /api/v1/notifications -- independently of which
 * inbox pages happen to be loaded (cold start, deep link, reopened app).
 * Keyed under the inbox's own ["notifications","mine",orgId] root, so the
 * read mutation's invalidation refreshes it too.
 *
 * Every request reads token and organization from the global API client,
 * which the query key cannot pin. So the search is bound to the session it
 * started in (captureApiSessionGuard), checked before and after each
 * request: if the user signs out, switches account or switches
 * organization mid-search, it stops -- no further page is requested in the
 * new context, and neither a result nor an error is stored under this key
 * (the query is cancelled and reverted to its pre-search state).
 */
export function useNotificationDetail(notificationId: string | undefined) {
  const { activeOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = activeOrganization?.id;
  const queryKey = ["notifications", "mine", orgId, "detail", notificationId] as const;

  return useApiQuery<NotificationLookup>(
    queryKey,
    async () => {
      const stillCurrent = orgId ? captureApiSessionGuard(orgId) : () => false;
      // cancelQueries reverts this key and settles the fetch first, so the
      // CancelledError below is never stored or retried.
      const abandon = async (): Promise<never> => {
        await queryClient.cancelQueries({ queryKey, exact: true });
        throw new CancelledError({ revert: true });
      };

      for (let page = 1; page <= MAX_PAGES; page++) {
        if (!stillCurrent()) return abandon();
        let response: PaginatedResponse<Notification>;
        try {
          response = await fetchNotifications(page, PER_PAGE);
        } catch (error) {
          // An error caused by the context change (e.g. a 401 after sign-out) is not this search's error.
          if (!stillCurrent()) return abandon();
          throw error;
        }
        if (!stillCurrent()) return abandon();
        const match = response.data.find((item) => item.id === notificationId);
        if (match) return { kind: "found", notification: match };
        const lastPage = response.meta?.last_page;
        if (lastPage === undefined || page >= lastPage) return { kind: "absent" };
      }
      return { kind: "not_located" };
    },
    {
      enabled: Boolean(orgId && notificationId),
      // Instant render when the inbox already has it; the API answer replaces it.
      placeholderData: () => {
        const inbox = queryClient.getQueryData<InfiniteData<PaginatedResponse<Notification>>>(["notifications", "mine", orgId]);
        for (const page of inbox?.pages ?? []) {
          const match = page.data.find((item) => item.id === notificationId);
          if (match) return { kind: "found", notification: match };
        }
        return undefined;
      },
    },
  );
}
