import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { queryClient } from "../api/queryClient";
import { strings } from "../i18n";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/AuthContext";
import { PushLifecycle } from "../components/PushLifecycle";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { routes } from "../navigation/routes";
import { initSentry } from "../services/sentry";
import { OrganizationProvider } from "../state/OrganizationProvider";
import { useOrganization } from "../state/OrganizationContext";

initSentry();

// Route segments reachable regardless of organization state (zero orgs, a
// failed org load, or an org-choice still pending) -- account-level or
// platform-wide screens that never need tenant context. Centralized here
// (both the organization-choice redirect and the org-load-error screen
// below read from the same set) rather than two separately-maintained
// inline lists.
const EXEMPT_SEGMENTS = new Set([
  "delete-account",
  "privacy",
  "leave-organization",
  "no-organization",
  "platform-notifications",
  "staff-invite",
]);

// Held until the official Manrope/JetBrains Mono weights are loaded, so the
// app never flashes system-font text -- see src/design-system/README.md.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AppErrorBoundary>
      {/* Light-first baseline: dark status bar icons/text so they stay
          visible against the app's light background (see
          design-system/theme.ts). Flip to "light" alongside that file if
          the app ever switches back to a dark default. */}
      <StatusBar style="dark" />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrganizationProvider>
            <PushLifecycle />
            <RootNavigation />
          </OrganizationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

function RootNavigation() {
  const { status: authStatus } = useAuth();
  const { status: orgStatus, organizations, activeOrganization, error: orgError, refresh: refreshOrganizations } = useOrganization();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (authStatus === "loading") return;

    const inAuthGroup = segments[0] === "(auth)";
    const inJoin = segments[0] === "join";
    const inStaffInvite = segments[0] === "staff-invite";
    const inOrganizationPicker = segments[0] === "organization-picker";
    const inExemptRoute = EXEMPT_SEGMENTS.has(segments[0]);

    if (authStatus === "signedOut") {
      if (!inAuthGroup && !inJoin && !inStaffInvite && segments[0] !== "privacy") router.replace(routes.login as never);
      return;
    }

    if (inAuthGroup || inJoin) {
      router.replace(routes.home as never);
      return;
    }

    const needsOrganizationChoice = orgStatus === "ready" && !activeOrganization && organizations.length > 1;
    if (needsOrganizationChoice && !inOrganizationPicker && !inExemptRoute) {
      router.replace(routes.organizationPicker as never);
      return;
    }

    // Zero organizations is a real, stable account state (not "still
    // loading a choice") -- see MembershipService::leave() on the backend,
    // which lets a user leave their last organization and keep their
    // account. Previously nothing redirected here at all, so the app fell
    // through to Home/Network with every SectionCard stuck in a permanent
    // skeleton (a disabled React Query reports isPending forever) -- see
    // SectionCard/PaginatedSectionCard's `enabled` prop for the
    // complementary fix on that side.
    const needsNoOrganizationScreen = orgStatus === "ready" && organizations.length === 0;
    const inNoOrganizationScreen = segments[0] === "no-organization";
    if (needsNoOrganizationScreen && !inNoOrganizationScreen && !inExemptRoute) {
      router.replace(routes.noOrganization as never);
    }
  }, [authStatus, orgStatus, activeOrganization, organizations.length, segments, router]);

  if (authStatus === "loading") {
    return <LoadingState message={strings.app.startingUp} />;
  }

  // Without this, a failed organization load leaves every tenant-scoped
  // query disabled (they all gate on activeOrganization) with no way to
  // recover -- every screen would sit in permanent, silent loading. This is
  // the one place that state is visible regardless of which screen is active.
  if (authStatus === "signedIn" && orgStatus === "error" && !EXEMPT_SEGMENTS.has(segments[0])) {
    return <ErrorState error={orgError} onRetry={() => void refreshOrganizations()} />;
  }

  return <Slot />;
}
