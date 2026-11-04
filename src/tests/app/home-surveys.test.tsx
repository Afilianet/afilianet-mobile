import { act, fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { ApiError } from "../../api/errors";
import { HomeSurveysCard } from "../../components/surveys/HomeSurveysCard";
import { cachedInbox, refreshInbox } from "../../features/surveys/library";
import type { AvailableSurvey } from "../../features/surveys/types";

/**
 * Home's Encuestas card (useAvailableSurveys): every survey open in the active
 * organization that this account can answer, each with its own access, from
 * GET /surveys/available -- independent of distributions and notifications.
 */
jest.setTimeout(30_000);

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  // Home is the focused screen here.
  useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
}));

let mockScope: { userId: string; organizationId: string } | null = { userId: "user-1", organizationId: "org-a" };
let mockOrganization: Record<string, unknown> | null = null;
jest.mock("../../features/surveys/runtime", () => ({
  useSurveyScope: () => mockScope,
  useSurveyOrganization: () => mockOrganization,
  surveySource: { kind: "api", origin: "api:https://staging-api.test" },
  surveysPreviewEnabled: true,
}));
jest.mock("../../features/surveys/library", () => ({ refreshInbox: jest.fn(), cachedInbox: jest.fn() }));
jest.mock("../../features/surveys/vault", () => ({
  scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
}));

const ID = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const available = (overrides: Partial<AvailableSurvey>): AvailableSurvey => ({
  survey_id: ID(1),
  id: "bbbbbbbb-0000-4000-8000-000000000001",
  version_number: 1,
  title: "Encuesta sintética",
  status: "published",
  closes_at: null,
  allows_self_response: true,
  allows_interview_response: false,
  is_assigned_surveyor: false,
  ...overrides,
});
const online = (surveys: AvailableSurvey[]) => ({ surveys, fetchedAt: "2026-11-04T18:00:00Z", origin: "api:https://staging-api.test" });

const foregroundListeners = () =>
  (AppState.addEventListener as unknown as jest.Mock).mock.calls.filter(([type]) => type === "change").map(([, listener]) => listener as (state: string) => void);

async function renderCard() {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(<HomeSurveysCard />);
  });
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = { userId: "user-1", organizationId: "org-a" };
  // A pending affiliate (profile present): may answer by themselves.
  mockOrganization = { id: "org-a", my_role: "affiliate", my_membership_status: "active", has_affiliate_profile: true };
  (cachedInbox as jest.Mock).mockResolvedValue(null);
});

describe("Home: surveys available to answer", () => {
  it("lists each open survey with its own «Responder», which opens that survey", async () => {
    (refreshInbox as jest.Mock).mockResolvedValue(online([available({}), available({ survey_id: ID(2), title: "Segunda encuesta" })]));
    const screen = await renderCard();

    expect(await screen.findByText("Tienes 2 encuestas disponibles.")).toBeTruthy();
    expect(screen.getByText("Encuesta sintética")).toBeTruthy();
    expect(screen.getByText("Segunda encuesta")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Responder la encuesta Segunda encuesta"));
    });
    expect(mockPush).toHaveBeenCalledWith(`/surveys/${ID(2)}`);
  });

  it("a survey published after Home was shown appears when the app returns to the foreground, with no distribution or notification", async () => {
    (refreshInbox as jest.Mock).mockResolvedValueOnce(online([]));
    const screen = await renderCard();
    expect(await screen.findByText("No tienes encuestas disponibles por ahora.")).toBeTruthy();

    (refreshInbox as jest.Mock).mockResolvedValueOnce(online([available({ title: "Recién publicada" })]));
    await act(async () => {
      foregroundListeners().forEach((listener) => listener("active"));
    });
    expect(await screen.findByText("Recién publicada")).toBeTruthy();
    expect(screen.getByText("Tienes 1 encuesta disponible.")).toBeTruthy();
  });

  it("lists only what this account can answer: self response needs a profile here, interviews need surveyor or staff", async () => {
    mockOrganization = { id: "org-a", my_role: "affiliate", my_membership_status: "active", has_affiliate_profile: false };
    (refreshInbox as jest.Mock).mockResolvedValue(
      online([
        available({ title: "Solo respuesta propia" }),
        available({ survey_id: ID(2), title: "Entrevista asignada", allows_self_response: false, allows_interview_response: true, is_assigned_surveyor: true }),
      ]),
    );
    const screen = await renderCard();

    expect(await screen.findByText("Entrevista asignada")).toBeTruthy();
    expect(screen.queryByText("Solo respuesta propia")).toBeNull();
  });

  it("shows three and sends the rest to Encuestas", async () => {
    (refreshInbox as jest.Mock).mockResolvedValue(online([1, 2, 3, 4, 5].map((n) => available({ survey_id: ID(n), title: `Encuesta ${n}` }))));
    const screen = await renderCard();

    expect(await screen.findByText("Tienes 5 encuestas disponibles.")).toBeTruthy();
    expect(screen.queryByText("Encuesta 4")).toBeNull();
    expect(screen.getByText("Y 2 más en Encuestas.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Abrir encuestas"));
    });
    expect(mockPush).toHaveBeenCalledWith("/surveys");
  });

  it("offline, uses the list saved for this organization and says so", async () => {
    (refreshInbox as jest.Mock).mockRejectedValue(new ApiError("offline", "Sin conexión."));
    (cachedInbox as jest.Mock).mockResolvedValue(online([available({ title: "Guardada" })]));
    const screen = await renderCard();

    expect(await screen.findByText("Guardada")).toBeTruthy();
    expect(screen.getByText("Sin conexión: lista guardada en el teléfono.")).toBeTruthy();
  });

  it("failing with nothing saved says it could not check, never that there are none", async () => {
    (refreshInbox as jest.Mock).mockRejectedValue(new ApiError("server", "Error."));
    const screen = await renderCard();

    expect(await screen.findByText("No pudimos consultar tus encuestas.")).toBeTruthy();
    expect(screen.queryByText("No tienes encuestas disponibles por ahora.")).toBeNull();
  });
});
