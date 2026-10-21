import { act, fireEvent, render, within } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { cachedInbox, getDownloaded, listDrafts, refreshInbox } from "../../features/surveys/library";
import { surveySource } from "../../features/surveys/runtime";
import { useSurveyOutbox } from "../../features/surveys/useSurveyOutbox";
import type { AvailableSurvey } from "../../features/surveys/types";
import SurveysInboxScreen from "../../app/surveys/index";

jest.setTimeout(30_000);

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  // The inbox is the focused screen here.
  useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
}));

let mockScope: { userId: string; organizationId: string } | null = { userId: "user-1", organizationId: "org-a" };
// An affiliate member unless a test says otherwise (staff may interview: see canStartInterview).
let mockOrganization: { my_role?: string; my_membership_status?: string } | null = { my_role: "affiliate", my_membership_status: "active" };
jest.mock("../../features/surveys/runtime", () => ({
  useSurveyScope: () => mockScope,
  useSurveyOrganization: () => mockOrganization,
  surveySource: { kind: "fixture", origin: "fixture" },
  surveysPreviewEnabled: true,
}));
jest.mock("../../features/surveys/useSurveyOutbox", () => {
  const outbox = { items: [], receipts: [], otherItems: [], otherReceipts: [], syncing: false, progress: null, message: null, sync: jest.fn(), discard: jest.fn(), discardAudio: jest.fn(), reload: jest.fn(async () => undefined) };
  return { useSurveyOutbox: () => outbox };
});
jest.mock("../../features/surveys/library", () => ({ refreshInbox: jest.fn(), cachedInbox: jest.fn(), getDownloaded: jest.fn(), listDrafts: jest.fn(async () => []) }));
jest.mock("../../features/surveys/vault", () => ({
  scopeId: (scope: { userId: string; organizationId: string }) => `${scope.userId}.${scope.organizationId}`,
}));

const available = (overrides: Partial<AvailableSurvey>): AvailableSurvey => ({
  survey_id: "s-1",
  id: "v-2",
  version_number: 2,
  title: "Satisfacción",
  status: "published",
  closes_at: null,
  allows_self_response: true,
  allows_interview_response: false,
  is_assigned_surveyor: false,
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
  mockOrganization = { my_role: "affiliate", my_membership_status: "active" };
  const outbox = (useSurveyOutbox as unknown as () => Record<string, unknown[]>)();
  outbox.items = [];
  outbox.receipts = [];
  outbox.otherItems = [];
  outbox.otherReceipts = [];
  (surveySource as { origin: string }).origin = "fixture";
  (listDrafts as jest.Mock).mockResolvedValue([]);
  mockScope = { userId: "user-1", organizationId: "org-a" };
  (getDownloaded as jest.Mock).mockResolvedValue(null);
});

describe("Surveys inbox", () => {
  it("offline, shows the saved list with its date and which surveys are available offline", async () => {
    (refreshInbox as jest.Mock).mockRejectedValue(new ApiError("offline", "Sin conexión."));
    (cachedInbox as jest.Mock).mockResolvedValue({ surveys: [available({}), available({ survey_id: "s-2", id: "v-9", title: "Vecinal" })], fetchedAt: "2026-10-11T18:00:00Z" });
    (getDownloaded as jest.Mock).mockImplementation(async (_scope, surveyId: string) =>
      surveyId === "s-1" ? { version: { id: "v-2", version_number: 2 }, downloadedAt: "2026-10-11T18:05:00Z" } : null,
    );
    const screen = await renderInbox();

    expect(screen.getByText(/Sin conexión. Mostrando la lista guardada el/)).toBeTruthy();
    expect(screen.getByText(/Disponible sin conexión \(descargada el/)).toBeTruthy();
    expect(screen.getByText(/la encuesta se prepara sola/)).toBeTruthy();
    expect(screen.getByText(/Los avisos de encuestas nuevas solo llegan con internet/)).toBeTruthy();
    expect(screen.getByText(/Vista previa con datos de ejemplo/)).toBeTruthy();
  });

  it("offline with nothing saved says so instead of an empty list", async () => {
    (refreshInbox as jest.Mock).mockRejectedValue(new ApiError("offline", "Sin conexión."));
    (cachedInbox as jest.Mock).mockResolvedValue(null);
    const screen = await renderInbox();
    expect(screen.getByText("Sin conexión y sin una lista guardada. Conéctate para ver tus encuestas.")).toBeTruthy();
  });

  it("offers the interview mode only to an assigned surveyor", async () => {
    (refreshInbox as jest.Mock).mockResolvedValue({
      surveys: [
        available({ survey_id: "s-a", title: "Asignado", allows_self_response: false, allows_interview_response: true, is_assigned_surveyor: true }),
        available({ survey_id: "s-b", title: "No asignado", allows_self_response: true, allows_interview_response: true, is_assigned_surveyor: false }),
      ],
      fetchedAt: "x",
    });
    const screen = await renderInbox();
    expect(screen.getByText("Entrevista · Versión 2")).toBeTruthy();
    expect(screen.getByText("Respuesta propia · Versión 2")).toBeTruthy();
  });

  it("flags a download that is older than the current version", async () => {
    (refreshInbox as jest.Mock).mockResolvedValue({ surveys: [available({ id: "v-3", version_number: 3 })], fetchedAt: "x" });
    (getDownloaded as jest.Mock).mockResolvedValue({ version: { id: "v-2", version_number: 2 }, downloadedAt: "2026-10-11T18:05:00Z" });
    const screen = await renderInbox();
    expect(screen.getByText("Tienes la versión 2; ya existe la versión 3. Descárgala de nuevo.")).toBeTruthy();
  });

  it("never shows the previous organization's list after switching", async () => {
    (refreshInbox as jest.Mock).mockResolvedValueOnce({ surveys: [available({ title: "Solo de org A" })], fetchedAt: "x" });
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
      resolveB({ surveys: [available({ title: "De org B" })], fetchedAt: "x" });
    });
    expect(screen.getByText("De org B")).toBeTruthy();
    expect((refreshInbox as jest.Mock).mock.calls[1][0]).toEqual({ userId: "user-1", organizationId: "org-b" });
  });
});

describe("Surveys inbox: origins (decisions C, D and F)", () => {
  const STAGING = "api:https://staging-api.afilianet.mx";
  const draft = (id: string, origin: string, title: string) => ({
    id,
    surveyId: `s-${id}`,
    versionId: `v-${id}`,
    surveyTitle: title,
    respondentType: "self",
    answers: {},
    consentAudio: null,
    audio: null,
    updatedAt: "2026-10-12T10:00:00Z",
    origin,
  });
  const item = (id: string, origin: string, title: string) => ({
    id,
    surveyId: "s",
    versionId: "v",
    surveyTitle: title,
    respondentType: "self",
    consentAudio: null,
    completedAt: "2026-10-12T10:00:00Z",
    audio: { clientAudioId: "a", mimeType: "audio/mp4", durationMs: 1000, interrupted: false, bytes: 1 },
    attempts: 0,
    origin,
  });

  beforeEach(() => {
    (refreshInbox as jest.Mock).mockResolvedValue({ surveys: [], fetchedAt: "x" });
  });

  it.each([
    ["fixture", "Modo de ejemplo: los envíos no salen del teléfono."],
    [STAGING, "Se envían a: Afilianet (servidor de pruebas)."],
    ["api:https://api.afilianet.mx", "Se envían a: Afilianet."],
    ["api:http://192.168.1.20:8000", "Se envían a: el servidor 192.168.1.20:8000."],
  ])("«Envíos» says where it sends in words (%s)", async (origin, text) => {
    (surveySource as { origin: string }).origin = origin;
    const screen = await renderInbox();
    expect(screen.getByTestId("survey-outbox-destination").props.children).toBe(text);
  });

  it("keeps another origin's and unconfirmed data in their own section, explained, view only, and never in the active outbox", async () => {
    const outbox = (useSurveyOutbox as unknown as () => Record<string, unknown[]>)();
    outbox.otherItems = [item("o-1", STAGING, "Pendiente de staging"), item("o-2", "unconfirmed", "Pendiente antiguo")];
    outbox.otherReceipts = [{ id: "r-1", surveyTitle: "Recibo antiguo", receivedAt: "2026-10-01T10:00:00Z", withAudio: false, origin: "unconfirmed" }];
    (listDrafts as jest.Mock).mockResolvedValue([draft("d-own", "fixture", "Borrador propio"), draft("d-stg", STAGING, "Borrador de staging"), draft("d-old", "unconfirmed", "Borrador antiguo")]);
    const screen = await renderInbox();

    expect(screen.getByText("No hay envíos pendientes.")).toBeTruthy();
    const other = screen.getByTestId("survey-other-origins");
    expect(screen.getByText("Guardado con otro origen")).toBeTruthy();
    expect(screen.getByText("Guardado con Afilianet (servidor de pruebas)")).toBeTruthy();
    expect(screen.getByText("No se envía a datos de ejemplo. Podrá enviarse cuando la app vuelva a usar Afilianet (servidor de pruebas).")).toBeTruthy();
    expect(screen.getByText("Origen sin confirmar")).toBeTruthy();
    expect(screen.getByText("Se guardó antes de que la app registrara su servidor. No se envía a ningún servidor.")).toBeTruthy();
    expect(screen.getAllByText("No se envía desde aquí")).toHaveLength(2);
    expect(screen.getByText("Recibo antiguo")).toBeTruthy();
    // Nothing in that section can be sent, edited or discarded from here; drafts can only be viewed.
    expect(screen.queryByText("Descartar del teléfono")).toBeNull();
    expect(screen.queryByText("Sincronizar ahora")).toBeNull();
    expect(screen.getAllByText("Consultar")).toHaveLength(2);
    expect(within(other).queryByTestId("draft-d-own")).toBeNull();
    expect(within(other).getByTestId("draft-d-stg")).toBeTruthy();
    expect(within(screen.getByTestId("survey-drafts")).getByTestId("draft-d-own")).toBeTruthy();
    expect(within(screen.getByTestId("survey-drafts")).queryByTestId("draft-d-stg")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getAllByText("Consultar")[0]);
    });
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("d-stg"));
  });

  it("each origin is its own group: its heading and explanation sit with its own drafts, unsent responses and receipts only", async () => {
    const outbox = (useSurveyOutbox as unknown as () => Record<string, unknown[]>)();
    outbox.otherItems = [item("o-stg", STAGING, "Entrevista de staging"), item("o-old", "unconfirmed", "Entrevista antigua")];
    outbox.otherReceipts = [
      { id: "r-old", surveyTitle: "Recibo antiguo", receivedAt: "2026-10-01T10:00:00Z", withAudio: true, origin: "unconfirmed" },
      { id: "r-stg", surveyTitle: "Recibo de staging", receivedAt: "2026-10-02T10:00:00Z", withAudio: false, origin: STAGING },
    ];
    (listDrafts as jest.Mock).mockResolvedValue([draft("d-stg", STAGING, "Borrador de staging"), draft("d-old", "unconfirmed", "Borrador antiguo")]);
    const screen = await renderInbox();

    const staging = within(screen.getByTestId(`other-origin-${STAGING}`));
    const unconfirmed = within(screen.getByTestId("other-origin-unconfirmed"));
    // Heading and explanation belong to their own group.
    expect(staging.getByText("Guardado con Afilianet (servidor de pruebas)")).toBeTruthy();
    expect(staging.queryByText("Origen sin confirmar")).toBeNull();
    expect(unconfirmed.getByText("Origen sin confirmar")).toBeTruthy();
    expect(unconfirmed.getByText("Se guardó antes de que la app registrara su servidor. No se envía a ningún servidor.")).toBeTruthy();
    expect(unconfirmed.queryByText(/Guardado con/)).toBeNull();
    // Records never leak into another origin's group.
    expect(staging.getByText("Entrevista de staging")).toBeTruthy();
    expect(staging.queryByText("Entrevista antigua")).toBeNull();
    expect(unconfirmed.getByText("Entrevista antigua")).toBeTruthy();
    expect(unconfirmed.queryByText("Borrador de staging")).toBeNull();
    // Drafts, unsent responses and receipts are separate, counted parts of the group.
    for (const [origin, records] of [[STAGING, ["Borrador de staging", "Entrevista de staging", "Recibo de staging"]], ["unconfirmed", ["Borrador antiguo", "Entrevista antigua", "Recibo antiguo"]]] as const) {
      const [draftTitle, unsentTitle, receiptTitle] = records;
      const drafts = within(screen.getByTestId(`other-origin-${origin}-drafts`));
      const unsent = within(screen.getByTestId(`other-origin-${origin}-unsent`));
      const receipts = within(screen.getByTestId(`other-origin-${origin}-receipts`));
      expect(drafts.getByText("Borradores (1)")).toBeTruthy();
      expect(drafts.getByText(draftTitle)).toBeTruthy();
      expect(drafts.queryByText(unsentTitle)).toBeNull();
      expect(unsent.getByText("Respuestas sin enviar (1)")).toBeTruthy();
      expect(unsent.getByText(unsentTitle)).toBeTruthy();
      expect(unsent.queryByText(receiptTitle)).toBeNull();
      expect(receipts.getByText("Recibidos (1)")).toBeTruthy();
      expect(receipts.getByText(receiptTitle)).toBeTruthy();
    }
    // State and audio stay visible on every record.
    expect(within(screen.getByTestId(`other-origin-${STAGING}-drafts`)).getByText("Borrador")).toBeTruthy();
    expect(within(screen.getByTestId("other-outbox-o-old")).getByText("No se envía desde aquí")).toBeTruthy();
    expect(within(screen.getByTestId("other-outbox-o-old")).getByText(/con audio/)).toBeTruthy();
    expect(within(screen.getByTestId("other-origin-unconfirmed-receipts")).getByText("Recibido")).toBeTruthy();
    expect(within(screen.getByTestId("other-origin-unconfirmed-receipts")).getByText(/con audio/)).toBeTruthy();
    // The explanation appears once per group, not per record.
    expect(screen.getAllByText("Se guardó antes de que la app registrara su servidor. No se envía a ningún servidor.")).toHaveLength(1);
  });

  it("the only action in another origin's group is viewing a draft", async () => {
    const outbox = (useSurveyOutbox as unknown as () => Record<string, unknown[]>)();
    outbox.otherItems = [item("o-stg", STAGING, "Entrevista de staging")];
    (listDrafts as jest.Mock).mockResolvedValue([draft("d-old", "unconfirmed", "Borrador antiguo")]);
    const screen = await renderInbox();

    const other = within(screen.getByTestId("survey-other-origins"));
    const buttons = other.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(within(buttons[0]).getByText("Consultar")).toBeTruthy();
    expect(other.queryByText("Continuar")).toBeNull();
    expect(other.queryByText("Descartar del teléfono")).toBeNull();
    expect(other.queryByText("Descartar borrador")).toBeNull();
    expect(other.queryByText("Sincronizar ahora")).toBeNull();
    // An origin with only one kind of record shows only that part.
    expect(screen.queryByTestId(`other-origin-${STAGING}-drafts`)).toBeNull();
    expect(screen.queryByTestId("other-origin-unconfirmed-unsent")).toBeNull();
    await act(async () => {
      fireEvent.press(other.getByText("Consultar"));
    });
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("d-old"));
  });
});
