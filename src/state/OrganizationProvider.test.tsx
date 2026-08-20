import { act, render, waitFor } from "@testing-library/react-native";
import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { fetchMe, fetchMyOrganizations, signIn as signInRequest } from "../api/endpoints";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth, type AuthContextValue } from "../auth/AuthContext";
import { OrganizationProvider } from "./OrganizationProvider";
import { useOrganization, type OrganizationContextValue } from "./OrganizationContext";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("../api/endpoints", () => ({
  fetchMe: jest.fn(),
  signIn: jest.fn(),
  signOutRequest: jest.fn().mockResolvedValue(undefined),
  fetchMyOrganizations: jest.fn(),
}));

const mockedGetItem = SecureStore.getItemAsync as jest.Mock;
const mockedSetItem = SecureStore.setItemAsync as jest.Mock;
const mockedDeleteItem = SecureStore.deleteItemAsync as jest.Mock;
const mockedFetchMe = fetchMe as jest.Mock;
const mockedSignIn = signInRequest as jest.Mock;
const mockedFetchMyOrganizations = fetchMyOrganizations as jest.Mock;

let authValue: AuthContextValue;
let orgValue: OrganizationContextValue;

function Capture() {
  const auth = useAuth();
  const org = useOrganization();
  useEffect(() => {
    authValue = auth;
    orgValue = org;
  });
  return null;
}

async function renderApp() {
  await act(async () => {
    await render(
      <AuthProvider>
        <OrganizationProvider>
          <Capture />
        </OrganizationProvider>
      </AuthProvider>,
    );
  });
  await waitFor(() => expect(authValue.status).not.toBe("loading"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
  mockedSetItem.mockResolvedValue(undefined);
  mockedDeleteItem.mockResolvedValue(undefined);
});

const ORG = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  legal_name: null,
  status: "active",
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  metadata: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  my_role: "owner",
  my_membership_status: "active",
};

describe("organization initialization after login", () => {
  it("auto-selects the organization when the user belongs to exactly one", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    mockedFetchMyOrganizations.mockResolvedValue([ORG]);

    await renderApp();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });

    await waitFor(() => expect(orgValue.status).toBe("ready"));
    expect(orgValue.activeOrganization?.id).toBe("org-1");
  });

  it("clears organization state on logout", async () => {
    mockedSignIn.mockResolvedValue({ token: "tok-abc", user: { id: "user-1" } });
    mockedFetchMe.mockResolvedValue({ id: "user-1", first_name: "Real" });
    mockedFetchMyOrganizations.mockResolvedValue([ORG]);

    await renderApp();
    await act(async () => {
      await authValue.signIn("person@example.com", "hunter2");
    });
    await waitFor(() => expect(orgValue.activeOrganization?.id).toBe("org-1"));

    await act(async () => {
      await authValue.signOut();
    });

    await waitFor(() => expect(orgValue.status).toBe("idle"));
    expect(orgValue.activeOrganization).toBeNull();
    expect(orgValue.organizations).toHaveLength(0);
  });
});
