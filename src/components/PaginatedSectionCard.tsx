import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../api/errors";
import type { PaginatedResponse } from "../types/api";
import { ForbiddenState } from "./ForbiddenState";
import { RetryButton } from "./RetryButton";
import { SkeletonGroup } from "./Skeleton";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { colors, spacing, typography } from "./ui/theme";

interface PaginatedSectionCardProps<T extends { id: string }> {
  title: string;
  /** Concise explanation of what this list means (e.g. distinguishing sponsor vs. placement) -- rendered under the title. */
  helpText?: string;
  query: UseInfiniteQueryResult<InfiniteData<PaginatedResponse<T>>, unknown>;
  emptyTitle?: string;
  renderItem: (item: T) => ReactNode;
  /** Fired right before fetchNextPage() -- callers use this for analytics; this component has no analytics of its own. */
  onLoadMorePress?: () => void;
}

/**
 * Same section-level independence as SectionCard (loading/empty/error/403
 * don't cascade to the rest of the screen), extended for useInfiniteQuery:
 * flattens all loaded pages, de-dupes by id (defensive -- the backend
 * orders pages stably by id/placement_position so duplicates shouldn't
 * occur, but a shifted offset from concurrent inserts is exactly the kind
 * of thing worth guarding against rather than trusting), and renders a
 * "Load more" control with its own loading/error state that never affects
 * the already-loaded rows above it.
 */
export function PaginatedSectionCard<T extends { id: string }>({
  title,
  helpText,
  query,
  emptyTitle,
  renderItem,
  onLoadMorePress,
}: PaginatedSectionCardProps<T>) {
  const apiError = isApiError(query.error) ? query.error : null;
  const forbidden = apiError?.kind === "forbidden";
  // Read once, unnarrowed -- react-query's discriminated union treats
  // isError/isFetchNextPageError as mutually exclusive in a way that
  // collapses `query` to `never` if fetchNextPage is accessed again inside
  // a branch already narrowed on isError below.
  const { fetchNextPage, isFetchingNextPage, hasNextPage, isFetchNextPageError } = query;

  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of query.data?.pages ?? []) {
    for (const item of page.data) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }

  let body: ReactNode = null;
  if (query.isPending) {
    body = <SkeletonGroup />;
  } else if (forbidden) {
    body = <ForbiddenState compact area={title.toLowerCase()} />;
  } else if (query.isError) {
    body = (
      <View style={styles.stateGroup}>
        <Text style={styles.error}>{apiError ? friendlyMessage(apiError) : "Couldn't load this."}</Text>
        <RetryButton onPress={() => void query.refetch()} loading={query.isFetching} />
      </View>
    );
  } else if (items.length === 0) {
    body = <Text style={styles.empty}>{emptyTitle ?? "Nothing here yet."}</Text>;
  } else {
    body = (
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item.id}>{renderItem(item)}</View>
        ))}
        {hasNextPage ? (
          <Button
            label={isFetchingNextPage ? "Loading..." : "Load more"}
            variant="ghost"
            size="sm"
            loading={isFetchingNextPage}
            accessibilityLabel={`Load more ${title.toLowerCase()}`}
            onPress={() => {
              onLoadMorePress?.();
              void fetchNextPage();
            }}
          />
        ) : null}
        {isFetchNextPageError ? (
          <View style={styles.stateGroup}>
            <Text style={styles.error}>Couldn&apos;t load more.</Text>
            <RetryButton onPress={() => void fetchNextPage()} loading={isFetchingNextPage} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {helpText ? <Text style={styles.helpText}>{helpText}</Text> : null}
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
  title: {
    ...typography.label,
    color: colors.textTertiary,
  },
  helpText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.sm,
  },
  stateGroup: {
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
