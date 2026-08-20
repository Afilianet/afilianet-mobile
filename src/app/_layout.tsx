import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { queryClient } from "../api/queryClient";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/AuthContext";
import { AppErrorBoundary } from "../components/AppErrorBoundary";
import { LoadingState } from "../components/LoadingState";
import { routes } from "../navigation/routes";
import { initSentry } from "../services/sentry";
import { OrganizationProvider } from "../state/OrganizationProvider";
import { useOrganization } from "../state/OrganizationContext";

initSentry();

export default function RootLayout() {
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
  const { status: orgStatus, organizations, activeOrganization } = useOrganization();
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

  return <Slot />;
}
