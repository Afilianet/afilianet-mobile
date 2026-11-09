import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  NETWORK_SEARCH_MAX_LENGTH,
  NETWORK_SEARCH_MIN_LENGTH,
  NetworkSearchUnsupportedError,
  useNetworkSearch,
  type NetworkSearchScope,
} from "../../hooks/useNetworkSearch";
import { strings } from "../../i18n";
import type { AffiliateProfile, PaginatedResponse } from "../../types/api";
import { AffiliateRow } from "../AffiliateRow";
import { PaginatedSectionCard } from "../PaginatedSectionCard";
import { SkeletonGroup } from "../Skeleton";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { colors, spacing, typography } from "../ui/theme";

export const NETWORK_SEARCH_DEBOUNCE_MS = 350;

/**
 * One direct list (sponsored or placement children) with server-side name
 * search. Without a search term it is exactly the existing paginated list.
 * The parent keys this component by account+organization, so switching
 * either one also clears the typed text.
 */
export function NetworkSearchSection({
  scope,
  title,
  helpText,
  emptyTitle,
  listQuery,
  onOpen,
  onLoadMorePress,
}: {
  scope: NetworkSearchScope;
  title: string;
  helpText: string;
  emptyTitle: string;
  listQuery: UseInfiniteQueryResult<InfiniteData<PaginatedResponse<AffiliateProfile>>, unknown>;
  onOpen: (affiliate: AffiliateProfile) => void;
  onLoadMorePress: () => void;
}) {
  const copy = strings.network.search;
  const [text, setText] = useState("");
  const typed = text.trim();
  const term = useDebouncedValue(typed, NETWORK_SEARCH_DEBOUNCE_MS);
  const searchQuery = useNetworkSearch(scope, term);

  const searching = typed.length >= NETWORK_SEARCH_MIN_LENGTH;
  const tooShort = typed.length > 0 && !searching;
  // While the debounce catches up, nothing from an older term is shown.
  const settling = searching && term !== typed;
  const unsupported = searching && !settling && searchQuery.error instanceof NetworkSearchUnsupportedError;

  const header = (
    <View style={styles.search}>
      <TextInput
        label={copy.label}
        accessibilityLabel={copy.a11y(title.toLowerCase())}
        value={text}
        onChangeText={setText}
        maxLength={NETWORK_SEARCH_MAX_LENGTH}
        autoCapitalize="words"
        returnKeyType="search"
        testID={`network-search-${scope}`}
      />
      {text.length > 0 ? <Button label={copy.clear} variant="ghost" size="sm" onPress={() => setText("")} /> : null}
      {tooShort ? <Text style={styles.hint}>{copy.minChars}</Text> : null}
    </View>
  );

  const renderItem = (affiliate: AffiliateProfile) => <AffiliateRow affiliate={affiliate} onPress={() => onOpen(affiliate)} />;

  if (!searching) {
    return (
      <PaginatedSectionCard
        title={title}
        helpText={helpText}
        query={listQuery}
        emptyTitle={emptyTitle}
        onLoadMorePress={onLoadMorePress}
        renderItem={renderItem}
        header={header}
      />
    );
  }

  return (
    <PaginatedSectionCard
      title={title}
      helpText={helpText}
      query={searchQuery}
      emptyTitle={copy.noResults(term)}
      onLoadMorePress={onLoadMorePress}
      renderItem={renderItem}
      header={header}
      override={
        settling ? (
          <SkeletonGroup />
        ) : unsupported ? (
          <View style={styles.unsupported} accessibilityRole="alert">
            <Text style={styles.body}>{copy.unsupported}</Text>
            <Button label={copy.clear} variant="secondary" size="sm" onPress={() => setText("")} />
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  search: { gap: spacing.xs },
  hint: { ...typography.caption, color: colors.textSecondary },
  unsupported: { gap: spacing.sm, alignItems: "flex-start" },
  body: { ...typography.body, color: colors.textSecondary },
});
