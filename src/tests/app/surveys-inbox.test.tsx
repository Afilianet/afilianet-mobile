import { act, render } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { cachedInbox, getDownloaded, refreshInbox } from "../../features/surveys/library";
import type { SurveyAssignment } from "../../features/surveys/types";
import SurveysInboxScreen from "../../app/surveys/index";

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

let mockScope: { userId: string; organizationId: string } | null = { userId: "user-1", organizationId: "org-a" };
jest.mock("../../features/surveys/runtime", () => ({
  useSurveyScope: () => mockScope,
  surveySource: { kind: "fixture" },
  surveysPreviewEnabled: true,
}));
jest.mock("../../features/surveys/useSurveyOutbox", () => ({
  useSurveyOutbox: () => ({ items: [], receipts: [], syncing: false, progress: null, message: null, sync: jest.fn(), discard: jest.fn() }),
}));
jest.mock("../../features/surveys/library", () => ({ refreshInbox: jest.fn(), cachedInbox: jest.fn(), getDownloaded: jest.fn() }));
jest.mock("../../features/surveys/vault", () => ({
  scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
}));

const assignment = (overrides: Partial<SurveyAssignment>): SurveyAssignment => ({
  survey_id: "s-1",
  organization_id: "org-a",
  title: "Satisfacción",
  current_version_id: "v-2",
  current_version: 2,
  modality: "self_administered",
  status: "open",
  closes_at: null,
  interviewer_authorized: false,
  ...overrides,
});

async function renderInbox() {
  let screen!: Awaited<ReturnType<typeof render>>;
  await act(async () => {
    screen = await render(<SurveysInboxScreen />);
  });
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScope = { userId: "user-1", organizationId: "org-a" };
  (getDownloaded as jest.Mock).mockResolvedValue(null);
});

describe("Surveys inbox", () => {
  it("offline, shows the saved list with its date and which surveys are available offline", async () => {
    (refreshInbox as jest.Mock).mockRejectedValue(new ApiError("offline", "Sin conexión."));
    (cachedInbox as jest.Mock).mockResolvedValue({ assignments: [assignment({}), assignment({ survey_id: "s-2", title: "Vecinal" })], fetchedAt: "2026-10-11T18:00:00Z" });
    (getDownloaded as jest.Mock).mockImplementation(async (_scope, surveyId: string) =>
      surveyId === "s-1" ? { version: { id: "v-2", version: 2 }, downloadedAt: "2026-10-11T18:05:00Z" } : null,
    );
    const screen = await renderInbox();

    expect(screen.getByText(/Sin conexión. Mostrando la lista guardada el/)).toBeTruthy();
    expect(screen.getByText(/Disponible sin conexión \(descargada el/)).toBeTruthy();
    expect(screen.getByText(/Descárgala antes de responder/)).toBeTruthy();
    expect(screen.getByText(/Los avisos de encuestas nuevas solo llegan con internet/)).toBeTruthy();
    expect(screen.getByText(/Vista previa con datos de ejemplo/)).toBeTruthy();
  });

  it("offline with nothing saved says so instead of an empty list", async () => {
    (refreshInbox as jest.Mock).mockRejectedValue(new ApiError("offline", "Sin conexión."));
    (cachedInbox as jest.Mock).mockResolvedValue(null);
    const screen = await renderInbox();
    expect(screen.getByText("Sin conexión y sin una lista guardada. Conéctate para ver tus encuestas.")).toBeTruthy();
  });

  it("flags a download that is older than the current version", async () => {
    (refreshInbox as jest.Mock).mockResolvedValue({ assignments: [assignment({ current_version_id: "v-3", current_version: 3 })], fetchedAt: "x" });
    (getDownloaded as jest.Mock).mockResolvedValue({ version: { id: "v-2", version: 2 }, downloadedAt: "2026-10-11T18:05:00Z" });
    const screen = await renderInbox();
    expect(screen.getByText("Tienes la versión 2; ya existe la versión 3. Descárgala de nuevo.")).toBeTruthy();
  });

  it("never shows the previous organization's list after switching", async () => {
    (refreshInbox as jest.Mock).mockResolvedValueOnce({ assignments: [assignment({ title: "Solo de org A" })], fetchedAt: "x" });
    const screen = await renderInbox();
    expect(screen.getByText("Solo de org A")).toBeTruthy();

    let resolveB!: (value: unknown) => void;
    (refreshInbox as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    mockScope = { userId: "user-1", organizationId: "org-b" };
    await act(async () => {
      screen.rerender(<SurveysInboxScreen />);
    });
    expect(screen.queryByText("Solo de org A")).toBeNull();

    await act(async () => {
      resolveB({ assignments: [assignment({ organization_id: "org-b", title: "De org B" })], fetchedAt: "x" });
    });
    expect(screen.getByText("De org B")).toBeTruthy();
    expect((refreshInbox as jest.Mock).mock.calls[1][0]).toEqual({ userId: "user-1", organizationId: "org-b" });
  });
});
