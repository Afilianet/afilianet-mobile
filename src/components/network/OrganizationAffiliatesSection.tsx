import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { NETWORK_SEARCH_MAX_LENGTH, NETWORK_SEARCH_MIN_LENGTH } from "../../hooks/useNetworkSearch";
import { useOrganizationAffiliates } from "../../hooks/useOrganizationAffiliates";
import { strings } from "../../i18n";
import { networkAffiliateDetail } from "../../navigation/routes";
import { AffiliateRow } from "../AffiliateRow";
import { PaginatedSectionCard } from "../PaginatedSectionCard";
import { SkeletonGroup } from "../Skeleton";
import { Button } from "../ui/Button";
import { TextInput } from "../ui/TextInput";
import { colors, spacing, typography } from "../ui/theme";
import { NETWORK_SEARCH_DEBOUNCE_MS } from "./NetworkSearchSection";

/**
 * Management view for organization staff: every affiliate of the active
 * organization, searchable by name or code; each opens its own profile and
 * network (the existing affiliate detail). The API checks the role on every
 * request (403 → «no permission» state). Keyed by organization by its
 * parent, so switching organization clears the search and its results.
 */
export function OrganizationAffiliatesSection() {
  const router = useRouter();
  const copy = strings.organizationAffiliates;
  const [text, setText] = useState("");
  const typed = text.trim();
  const term = useDebouncedValue(typed, NETWORK_SEARCH_DEBOUNCE_MS);
  const searching = typed.length >= NETWORK_SEARCH_MIN_LENGTH;
  const tooShort = typed.length > 0 && !searching;
  const settling = searching && term !== typed;
  const query = useOrganizationAffiliates(searching && !settling ? term : "");

  return (
    <PaginatedSectionCard
      title={copy.title}
      helpText={copy.helpText}
      query={query}
      emptyTitle={searching ? copy.noResults(term) : copy.emptyTitle}
      renderItem={(affiliate) => <AffiliateRow affiliate={affiliate} onPress={() => router.push(networkAffiliateDetail(affiliate.id) as never)} />}
      header={
        <View style={styles.search}>
          <TextInput
            label={copy.searchLabel}
            accessibilityLabel={copy.searchA11y}
            value={text}
            onChangeText={setText}
            maxLength={NETWORK_SEARCH_MAX_LENGTH}
            autoCapitalize="words"
            returnKeyType="search"
            testID="organization-affiliates-search"
          />
          {text.length > 0 ? <Button label={strings.network.search.clear} variant="ghost" size="sm" onPress={() => setText("")} /> : null}
          {tooShort ? <Text style={styles.hint}>{strings.network.search.minChars}</Text> : null}
        </View>
      }
      override={settling ? <SkeletonGroup /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  search: { gap: spacing.xs },
  hint: { ...typography.caption, color: colors.textSecondary },
});
