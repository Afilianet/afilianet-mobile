import { render } from "@testing-library/react-native";
import NotificationSettingsScreen from "../../app/notification-settings";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";
import type { Organization } from "../../types/api";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock("../../components/PushPreferences", () => ({
  PushPreferences: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>push-preferences-section</Text>;
  },
}));

jest.mock("../../components/PlatformPushPreferences", () => ({
  PlatformPushPreferences: () => {
    const { Text } = jest.requireActual("react-native");
    return <Text>platform-push-preferences-section</Text>;
  },
}));

const ORG: Organization = {
  id: "org-a",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "es",
  currency: "MXN",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  my_role: "affiliate",
  my_membership_status: "active",
};

function orgValue(activeOrganization: Organization | null): OrganizationContextValue {
  return {
    status: "ready",
    organizations: activeOrganization ? [activeOrganization] : [],
    activeOrganization,
    error: null,
    selectOrganization: jest.fn(),
    refresh: jest.fn(),
  };
}

async function renderSettings(activeOrganization: Organization | null) {
  return render(
    <OrganizationContext.Provider value={orgValue(activeOrganization)}>
      <NotificationSettingsScreen />
    </OrganizationContext.Provider>,
  );
}

describe("Notification settings", () => {
  it("holds the organization's push preferences that used to sit on top of the inbox", async () => {
    const { getByText, queryByText } = await renderSettings(ORG);

    expect(getByText("Configurar notificaciones")).toBeTruthy();
    expect(getByText("push-preferences-section")).toBeTruthy();
    expect(queryByText("platform-push-preferences-section")).toBeNull();
  });

  it("shows only the platform-wide preferences, and nothing organization-scoped, without an active organization", async () => {
    const { getByText, queryByText } = await renderSettings(null);

    expect(getByText("platform-push-preferences-section")).toBeTruthy();
    expect(queryByText("push-preferences-section")).toBeNull();
  });
});
