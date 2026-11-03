import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { fetchRegistrationOrganizations, resolveRegistrationCode, type RegistrationOption } from "../../api/endpoints";
import { friendlyMessage, isApiError } from "../../api/errors";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TextInput } from "../ui/TextInput";
import { colors, spacing, typography } from "../ui/theme";
import { strings } from "../../i18n";
import { parseRegistrationReferral } from "../../utils/referral";

/**
 * Finds a referral by code/link or by an organization with open
 * registration, then opens /join/{organization}/{code}. Used signed out
 * (Tengo una invitación) and signed in without an organization (later
 * affiliation with the same account) -- /join decides which of the two.
 */
export function InvitationFinder() {
  const router = useRouter();
  const copy = strings.auth.registration;
  const [mode, setMode] = useState<"code" | "organization">("code");
  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<RegistrationOption[] | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  function continueWith(option: RegistrationOption) {
    router.push(`/join/${encodeURIComponent(option.organization_id)}/${encodeURIComponent(option.affiliate_code)}` as never);
  }

  async function load(kind: "code" | "organization", page = 1) {
    const version = ++requestVersion.current;
    setBusy(true);
    setError(null);
    if (page === 1) setOptions(null);
    try {
      if (kind === "code") {
        const parsed = parseRegistrationReferral(code);
        if (!parsed) {
          setError(copy.invalidCode);
          return;
        }
        if (parsed.organizationId) {
          continueWith({ organization_id: parsed.organizationId, affiliate_code: parsed.code, organization_name: "", referrer_first_name: "" });
          return;
        }
        const matches = await resolveRegistrationCode(parsed.code);
        if (requestVersion.current === version) setOptions(matches);
      } else {
        const result = await fetchRegistrationOrganizations(search.trim(), page);
        if (requestVersion.current === version) {
          setOptions((previous) => page === 1 ? result.data : [...(previous ?? []), ...result.data]);
          setNextPage(result.next_page);
        }
      }
    } catch (failure) {
      if (requestVersion.current === version) setError(isApiError(failure) ? friendlyMessage(failure) : strings.shared.genericError);
    } finally {
      if (requestVersion.current === version) setBusy(false);
    }
  }

  function chooseMode(next: "code" | "organization") {
    requestVersion.current += 1;
    setMode(next);
    setOptions(null);
    setNextPage(null);
    setError(null);
    setBusy(false);
    if (next === "organization") void load(next);
  }

  return (
    <View style={styles.group}>
      <View style={styles.group}>
        <Button label={copy.withCode} variant={mode === "code" ? "primary" : "ghost"} onPress={() => chooseMode("code")} />
        <Button label={copy.chooseOrganization} variant={mode === "organization" ? "primary" : "ghost"} onPress={() => chooseMode("organization")} />
      </View>
      {mode === "code" ? (
        <View style={styles.group}>
          <TextInput label={copy.codeLabel} value={code} onChangeText={(value) => { requestVersion.current += 1; setCode(value); setOptions(null); setError(null); setBusy(false); }} helperText={copy.codeHint} />
          <Button label={copy.findInvitation} onPress={() => void load("code")} loading={busy} disabled={!code.trim()} />
        </View>
      ) : (
        <View style={styles.group}>
          <TextInput label={copy.organizationSearch} value={search} onChangeText={(value) => { requestVersion.current += 1; setSearch(value); setOptions(null); setNextPage(null); setBusy(false); }} />
          <Button label={copy.search} onPress={() => void load("organization")} loading={busy} />
          <Text style={styles.description}>{copy.openOrganizationsOnly}</Text>
        </View>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {options?.length === 0 && !busy ? <Text style={styles.description}>{mode === "code" ? copy.codeNotFound : copy.noOrganizations}</Text> : null}
      {options?.map((option) => (
        <Card key={`${option.organization_id}/${option.affiliate_code}`} style={styles.group}>
          <Text style={styles.organization}>{option.organization_name}</Text>
          <Text style={styles.description}>{strings.auth.join.invitedBy(option.referrer_first_name)}</Text>
          <Button label={copy.continueWith(option.organization_name)} onPress={() => continueWith(option)} />
        </Card>
      ))}
      {mode === "organization" && nextPage && !error ? <Button label={strings.shared.loadMore} variant="ghost" loading={busy} onPress={() => void load("organization", nextPage)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  organization: { ...typography.bodyStrong, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  group: { gap: spacing.sm },
  error: { ...typography.caption, color: colors.danger },
});
