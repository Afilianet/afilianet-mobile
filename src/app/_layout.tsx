import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from "@expo-google-fonts/manrope";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { queryClient } from "../api/queryClient";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/AuthContext";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { routes } from "../navigation/routes";
import { initSentry } from "../services/sentry";
import { OrganizationProvider } from "../state/OrganizationProvider";
import { useOrganization } from "../state/OrganizationContext";

initSentry();

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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrganizationProvider>
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
    const inOrganizationPicker = segments[0] === "organization-picker";

    if (authStatus === "signedOut") {
      if (!inAuthGroup) router.replace(routes.login as never);
      return;
    }

    if (inAuthGroup) {
      router.replace(routes.home as never);
      return;
    }

    const needsOrganizationChoice = orgStatus === "ready" && !activeOrganization && organizations.length > 1;
    if (needsOrganizationChoice && !inOrganizationPicker) {
      router.replace(routes.organizationPicker as never);
    }
  }, [authStatus, orgStatus, activeOrganization, organizations.length, segments, router]);

  if (authStatus === "loading") {
    return <LoadingState message="Starting up..." />;
  }

  // Without this, a failed organization load leaves every tenant-scoped
  // query disabled (they all gate on activeOrganization) with no way to
  // recover -- every screen would sit in permanent, silent loading. This is
  // the one place that state is visible regardless of which screen is active.
  if (authStatus === "signedIn" && orgStatus === "error") {
    return <ErrorState error={orgError} onRetry={() => void refreshOrganizations()} />;
  }

  return <Slot />;
}
