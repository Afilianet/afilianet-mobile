import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { enrollAsOwner, fetchOwnerEnrollment } from "../../api/access";
import { fetchGeneralNotice } from "../../api/privacy";
import OwnerEnrollmentScreen from "../../app/owner-enrollment";
import { ownerSelfEnrollment } from "../../state/membership";
import { G1, QUALITY, notice, ref, sha } from "../support/registrationConsentsFixtures";

/**
 * «Incorporarme como afiliado» against API #158's contract (draft,
 * OWNER_AFFILIATE_ENROLLMENT.md): the owner's own step, compact notices,
 * exactly what was shown is sent, nothing starts KYC. Fictitious data only.
 */
const mockRouter = { push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner-1" } }) }));
const mockReload = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
jest.mock("../../state/OrganizationContext", () => ({
  useOrganization: () => ({ activeOrganization: { id: "org-play", name: "Organización ficticia" }, refresh: mockRefresh, reloadOrganizations: mockReload }),
}));
jest.mock("../../api/access", () => ({ ...jest.requireActual("../../api/access"), fetchOwnerEnrollment: jest.fn(), enrollAsOwner: jest.fn() }));
jest.mock("../../api/privacy", () => ({ ...jest.requireActual("../../api/privacy"), fetchGeneralNotice: jest.fn() }));
let mockIds = 0;
jest.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++mockIds}` }));

const ORG_NOTICE = { ...notice("org-ficticia.1", sha("f"), []), scope: "organization" };
const step = (general_required: boolean) => ({
  available: true, reason: null, pending_from_creation: true,
  privacy: { required: true, privacy_notice: ref(G1), organization_notice: ORG_NOTICE, general_required, verification_expected: false },
});
const getStep = fetchOwnerEnrollment as jest.Mock;
const post = enrollAsOwner as jest.Mock;

type View = Awaited<ReturnType<typeof render>>;
async function mount() {
  let view!: View;
  await act(async () => { view = await render(<OwnerEnrollmentScreen />); });
  return view;
}
const pressId = async (view: View, id: string) => act(async () => { fireEvent.press(view.getByTestId(id)); });
const press = async (view: View, text: string) => act(async () => { fireEvent.press(view.getByText(text)); });

beforeEach(() => {
  jest.clearAllMocks();
  (fetchGeneralNotice as jest.Mock).mockResolvedValue(G1);
  post.mockResolvedValue({ organization_role: "owner", already_affiliated: false, affiliate: { id: "aff-1", affiliate_code: "OWN100", status: "pending" } });
});

describe("ownerSelfEnrollment", () => {
  it("only the server's explicit `available` offers it; a missing field is not available", () => {
    expect(ownerSelfEnrollment({})).toEqual({ available: false, suggested: false });
    expect(ownerSelfEnrollment(null)).toEqual({ available: false, suggested: false });
    expect(ownerSelfEnrollment({ affiliate_self_enrollment: { available: false, suggested: true } })).toEqual({ available: false, suggested: false });
    expect(ownerSelfEnrollment({ affiliate_self_enrollment: { available: true, suggested: true } })).toEqual({ available: true, suggested: true });
  });
});

describe("Incorporarme como afiliado", () => {
  it("organization notice only: the box is required; the body carries exactly what was shown, no general notice, no consents", async () => {
    getStep.mockResolvedValue(step(false));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("step-notices")).toBeTruthy());
    expect(getStep).toHaveBeenCalledWith("org-play");
    expect(view.getByTestId("notice-link-organization")).toBeTruthy();
    expect(view.queryByTestId("notice-link-general")).toBeNull();

    await press(view, "Incorporarme");
    expect(post).not.toHaveBeenCalled();
    expect(view.getByText("Marca la casilla para continuar.")).toBeTruthy();

    await pressId(view, "notice-confirmation");
    await press(view, "Incorporarme");
    expect(post).toHaveBeenCalledWith("org-play", { organization_notice: ref(ORG_NOTICE), client_request_id: expect.stringMatching(/^attempt-/) });
    expect(mockReload).toHaveBeenCalled();
    expect(mockRouter.dismissTo.mock.calls.length + mockRouter.replace.mock.calls.length).toBe(1);
  });

  it("general notice required: both refs; the optional box stays unticked and sends nothing unless ticked", async () => {
    getStep.mockResolvedValue(step(true));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("notice-link-general")).toBeTruthy());
    expect(view.getByText(QUALITY.text)).toBeTruthy();
    await pressId(view, "notice-confirmation");
    await press(view, "Incorporarme");
    expect(post.mock.calls[0][1]).toEqual({ privacy_notice: ref(G1), organization_notice: ref(ORG_NOTICE), client_request_id: expect.any(String) });
  });

  it("ticking the optional box sends it as granted on the general notice shown", async () => {
    getStep.mockResolvedValue(step(true));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("consent-box-quality_testing")).toBeTruthy());
    await pressId(view, "notice-confirmation");
    await pressId(view, "consent-box-quality_testing");
    await press(view, "Incorporarme");
    expect(post.mock.calls[0][1].consents).toEqual([{ document: ref(G1), purpose: "quality_testing", decision: "granted" }]);
  });

  it("200 already_affiliated: says nothing changed and stays", async () => {
    getStep.mockResolvedValue(step(false));
    post.mockResolvedValue({ organization_role: "owner", already_affiliated: true });
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("step-notices")).toBeTruthy());
    await pressId(view, "notice-confirmation");
    await press(view, "Incorporarme");
    expect(view.getByTestId("owner-enrollment-already")).toBeTruthy();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("403 not_owner on the lookup: no form and nothing sent", async () => {
    getStep.mockRejectedValue(new ApiError("forbidden", "x", 403, undefined, { reason: "not_owner" }));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("owner-enrollment-unavailable")).toBeTruthy());
    expect(view.getByText("Solo el owner de la organización puede incorporarse desde aquí.")).toBeTruthy();
    expect(view.queryByText("Incorporarme")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("409 privacy_notice_outdated: nothing written; the step reloads and the box must be ticked again", async () => {
    const ORG_NOTICE_2 = { ...notice("org-ficticia.2", sha("9"), []), scope: "organization" };
    getStep.mockResolvedValueOnce(step(false)).mockResolvedValue({ ...step(false), privacy: { ...step(false).privacy, organization_notice: ORG_NOTICE_2 } });
    post.mockRejectedValueOnce(new ApiError("conflict", "x", 409, undefined, { reason: "privacy_notice_outdated" }));
    const view = await mount();
    await waitFor(() => expect(view.getByTestId("step-notices")).toBeTruthy());
    await pressId(view, "notice-confirmation");
    await press(view, "Incorporarme");
    await waitFor(() => expect(getStep).toHaveBeenCalledTimes(2));
    expect(mockReload).not.toHaveBeenCalled();
    await waitFor(() => expect(view.getByText(/versión org-ficticia.2/)).toBeTruthy());
    expect(view.getByTestId("notice-confirmation").props.accessibilityState?.checked).toBe(false);
    await pressId(view, "notice-confirmation");
    await press(view, "Incorporarme");
    expect(post.mock.calls[1][1].organization_notice).toEqual(ref(ORG_NOTICE_2));
    // Same attempt: nothing was written by the refused request.
    expect(post.mock.calls[1][1].client_request_id).toBe(post.mock.calls[0][1].client_request_id);
  });
});
