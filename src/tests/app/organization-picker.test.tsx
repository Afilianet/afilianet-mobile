import { act, fireEvent, render } from "@testing-library/react-native";
import OrganizationPickerScreen from "../../app/organization-picker";
import { OrganizationContext, type OrganizationContextValue } from "../../state/OrganizationContext";

/**
 * Physical round P1 (2026-10-27): the forced first choice ended with router.back(), and the history
 * still held the previous account's no-organization screen, shown without a bottom bar.
 */
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }) }));
jest.mock("../../services/analytics", () => ({ analytics: { capture: jest.fn() } }));

const orgA = { id: "org-a", name: "Org A", my_role: "affiliate" } as OrganizationContextValue["organizations"][number];
const orgB = { id: "org-b", name: "Org B", my_role: "affiliate" } as OrganizationContextValue["organizations"][number];
function organizations(active: OrganizationContextValue["activeOrganization"]): OrganizationContextValue {
  return { status: "ready", organizations: [orgA, orgB], activeOrganization: active, error: null, selectOrganization: jest.fn(async () => undefined), refresh: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
});

async function choose(value: OrganizationContextValue, name: string) {
  const view = await render(<OrganizationContext.Provider value={value}><OrganizationPickerScreen /></OrganizationContext.Provider>);
  await act(async () => fireEvent.press(view.getByText(name)));
}

it("a forced first choice goes Home even when an older history allows going back", async () => {
  const value = organizations(null);
  await choose(value, "Org A");
  expect(value.selectOrganization).toHaveBeenCalledWith("org-a");
  expect(mockReplace).toHaveBeenCalledWith("/(app)");
  expect(mockBack).not.toHaveBeenCalled();
});

it("a voluntary switch returns to the screen underneath", async () => {
  await choose(organizations(orgA), "Org B");
  expect(mockBack).toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
