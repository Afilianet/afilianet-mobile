import { screen } from "@testing-library/react-native";
import { act, fireEvent, renderRouter } from "expo-router/testing-library";
import { analytics } from "../../services/analytics";
import { Text } from "react-native";
import RootLayout from "../../app/_layout";
import AppTabsLayout from "../../app/(app)/_layout";
import NetworkScreen from "../../app/(app)/network";
import ReferralScreen from "../../app/referral";

/**
 * Red → «Invitar a alguien» → «Cerrar» with the REAL app: the real root layout
 * (providers' consumers, redirect guard, PushLifecycle), the real bar, the
 * real Red screen and the real referral screen -- pressing their own buttons,
 * never router calls from the test. On the Galaxy A06 «Cerrar» showed Inicio:
 * a second tap while the screen was still closing ran a second, global
 * «atrás», which the bar took back through its history (Red → Inicio).
 */
jest.setTimeout(30_000);

const USER = { id: "user-1", name: "Andrés", email: "a@example.test" };
const ORG = {
  id: "org-a",
  name: "Org A",
  slug: "org-a",
  status: "active",
  my_role: "affiliate",
  my_membership_status: "active",
  has_affiliate_profile: true,
};
const AFFILIATE = { id: "aff-1", affiliate_code: "AFF100", status: "active", sponsor: null, organization_id: "org-a", joined_at: "2026-01-01T00:00:00Z", activated_at: null, metadata: null, created_at: "2026-01-01T00:00:00Z" };

jest.mock("../../services/sentry", () => ({ initSentry: jest.fn() }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn(), identify: jest.fn(), reset: jest.fn() } }));
jest.mock("../../services/push", () => ({ registerPush: jest.fn().mockResolvedValue(true), unregisterPush: jest.fn() }));
jest.mock("expo-notifications", () => ({
  addPushTokenListener: () => ({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-font", () => ({ useFonts: () => [true, null], isLoaded: () => true, loadAsync: jest.fn() }));
jest.mock("../../auth/AuthProvider", () => ({ AuthProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signedIn", user: mockUser, onboardingRoute: null }),
}));
jest.mock("../../state/OrganizationProvider", () => ({ OrganizationProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../state/OrganizationContext", () => ({ useOrganization: () => mockOrganization }));
jest.mock("../../api/privacy", () => ({ fetchMyPrivacy: jest.fn().mockResolvedValue(null), myPrivacyKey: (id: string) => ["privacy", id] }));
jest.mock("../../api/assistedEnrollment", () => ({ fetchPendingAssistedEnrollments: jest.fn().mockResolvedValue({ data: [], meta: { last_page: 1 } }) }));
jest.mock("../../services/assistedQueue", () => ({
  listPendingAssisted: jest.fn().mockResolvedValue([]),
  syncPendingAssisted: jest.fn(),
  removePendingAssisted: jest.fn(),
  retryBlockedAssisted: jest.fn(),
  canRetryBlocked: () => false,
}));
const ok = (data: unknown) => () => ({ data, error: null, isPending: false, isFetching: false, isError: false, refetch: jest.fn() });
jest.mock("../../hooks/useAffiliateProfile", () => ({ useAffiliateProfile: () => mockOk(mockAffiliate) }));
jest.mock("../../hooks/useMyInvitations", () => ({ useMyInvitations: () => mockOk({ data: [] }) }));
jest.mock("../../hooks/useMySponsor", () => ({ useMySponsor: () => mockOk(null) }));
jest.mock("../../hooks/useMySponsored", () => ({ useMySponsored: () => mockOk({ pages: [{ data: [], meta: { total: 0 } }] }) }));
jest.mock("../../hooks/useMyPlacementParent", () => ({ useMyPlacementParent: () => mockOk(null) }));
jest.mock("../../hooks/useMyPlacementChildren", () => ({ useMyPlacementChildren: () => mockOk({ pages: [{ data: [], meta: { total: 0 } }] }) }));

const mockUser = USER;
const mockAffiliate = AFFILIATE;
const mockOrganization = { status: "ready", organizations: [ORG], activeOrganization: ORG, error: null, selectOrganization: jest.fn(), refresh: jest.fn() };
const mockOk = (data: unknown) => ok(data)();

const Inicio = () => <Text>pantalla:inicio</Text>;

async function start() {
  const rendered = renderRouter(
    {
      _layout: RootLayout,
      "(auth)/login": () => <Text>pantalla:login</Text>,
      "(app)/_layout": AppTabsLayout,
      "(app)/index": Inicio,
      "(app)/network": NetworkScreen,
      "(app)/profile": () => <Text>pantalla:perfil</Text>,
      "(app)/surveys/index": () => <Text>pantalla:encuestas</Text>,
      referral: ReferralScreen,
    },
    { initialUrl: "/" },
  );
  await (rendered as unknown as Promise<unknown>);
  return { app: rendered };
}

const networkMounts = () => (analytics.capture as jest.Mock).mock.calls.filter(([event]) => event === "network_viewed").length;

async function openReferralFromRed() {
  const { app } = await start();
  expect(await screen.findByText("pantalla:inicio")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: /^Red/ }));
  });
  expect(app.getPathname()).toBe("/network");
  await act(async () => {
    fireEvent.press(await screen.findByText("Invitar a alguien"));
  });
  expect(app.getPathname()).toBe("/referral");
  // Wrapped: the render result is thenable, an async function would unwrap it.
  return { app };
}

beforeEach(() => jest.clearAllMocks());

describe("Red → «Invitar a alguien» → «Cerrar», real screens", () => {
  it("returns to Red, the same screen (not mounted again), with the bar", async () => {
    const { app } = await openReferralFromRed();
    expect(networkMounts()).toBe(1);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("Cerrar"));
    });
    expect(app.getPathname()).toBe("/network");
    expect(screen.getByText("Invitar a alguien")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Inicio/ })).toBeTruthy();
    expect(networkMounts()).toBe(1);
  });

  it("a second tap on «Cerrar» while the screen is still closing never takes the bar back to Inicio", async () => {
    const { app } = await openReferralFromRed();
    const close = screen.getByLabelText("Cerrar");

    await act(async () => {
      fireEvent.press(close);
      fireEvent.press(close);
    });
    expect(app.getPathname()).toBe("/network");
    expect(screen.queryByText("pantalla:inicio")).toBeNull();
    expect(networkMounts()).toBe(1);
  });
});
