import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../api/errors";
import { ForbiddenState } from "./ForbiddenState";
import { RetryButton } from "./RetryButton";
import { SkeletonGroup } from "./Skeleton";
import { Card } from "./ui/Card";
import { colors, spacing, typography } from "./ui/theme";

interface SectionCardProps<T> {
  title: string;
  query: UseQueryResult<T, unknown>;
  /** Returns true when `data` should render as the empty state instead of `children`. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Overrides the plain title/description empty rendering with custom content (e.g. a CTA button). */
  emptyContent?: ReactNode;
  children: (data: T) => ReactNode;
}

/**
 * A tenant-data card with its own loading/empty/error handling, so one
 * section failing (offline, 5xx, ...) never blocks the rest of Home. A 404
 * is treated as "nothing here yet" (empty), not a failure -- see
 * src/utils/statusCopy.ts and the Phase 7B.1 plan for why.
 */
export function SectionCard<T>({
  title,
  query,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyContent,
  children,
}: SectionCardProps<T>) {
  const apiError = isApiError(query.error) ? query.error : null;
  const notFound = apiError?.kind === "not_found";
  const forbidden = apiError?.kind === "forbidden";
  const showEmpty = notFound || (query.data !== undefined && (isEmpty?.(query.data) ?? false));

  let body: ReactNode = null;
  if (query.isPending) {
    // Covers the first fetch and the "waiting on a prerequisite" case (a
    // disabled query has no data/error yet either) -- but not a background
    // refetch of already-successful data, so pull-to-refresh doesn't reset
    // a populated card back to a skeleton.
    body = <SkeletonGroup />;
  } else if (forbidden) {
    body = <ForbiddenState compact area={title.toLowerCase()} />;
  } else if (query.isError && !notFound) {
    body = (
      <View style={styles.stateGroup}>
        <Text style={styles.error}>{apiError ? friendlyMessage(apiError) : "Couldn't load this."}</Text>
        <RetryButton onPress={() => void query.refetch()} loading={query.isFetching} />
      </View>
    );
  } else if (showEmpty) {
    body = emptyContent ?? (
      <View style={styles.stateGroup}>
        <Text style={styles.empty}>{emptyTitle ?? "Nothing here yet."}</Text>
        {emptyDescription ? <Text style={styles.emptyDescription}>{emptyDescription}</Text> : null}
      </View>
    );
  } else if (query.data !== undefined) {
    body = children(query.data);
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
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
  emptyDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
