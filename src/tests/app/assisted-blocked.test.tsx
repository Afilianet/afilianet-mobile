import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import AssistedOfflineScreen from "../../app/assisted-offline/[requestId]";
import { removePendingAssisted, retryBlockedAssisted, type PendingAssistedEnrollment } from "../../services/assistedQueue";
import { discardConfirmation } from "../../utils/assistedPending";

/**
 * A draft stopped by an organization setting (API #92
 * assisted_enrollment_unavailable, API #86 kyc_unavailable): the screen
 * explains why, keeps everything, and only deletes this phone's copy after an
 * explicit confirmation that says what stays on the server.
 */
const mockBack = jest.fn();
let mockItem: PendingAssistedEnrollment;
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ requestId: "request-a" }), useRouter: () => ({ back: mockBack }) }));
jest.mock("expo-file-system", () => ({ File: class { size = 1000; } }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "sponsor-a" } }) }));
let mockOrganization: { id: string; assisted_enrollment_available?: boolean } = { id: "org-a" };
jest.mock("../../state/OrganizationContext", () => ({ useOrganization: () => ({ activeOrganization: mockOrganization }) }));
jest.mock("../../hooks/useDocumentCamera", () => ({ useDocumentCamera: () => ({ capture: jest.fn() }) }));
jest.mock("../../utils/geolocation", () => ({ captureDeviceGeolocation: jest.fn(), buildGeolocationSubmission: jest.fn() }));
jest.mock("../../services/assistedQueue", () => ({
  ...jest.requireActual("../../services/assistedQueue"),
  // A fresh object per read, as JSON.parse gives the real queue.
  listPendingAssisted: jest.fn(async () => [structuredClone(mockItem)]),
  removePendingAssisted: jest.fn(async () => undefined),
  retryBlockedAssisted: jest.fn(async () => { delete mockItem.blocked; }),
  replaceAssistedPhoto: jest.fn(), replaceAssistedGeolocation: jest.fn(),
}));
// API #92 read-only lookup before discarding; the session guard always matches here.
const mockLookup = jest.fn();
jest.mock("../../api/assistedEnrollment", () => ({ lookupAssistedEnrollmentByRequest: (...args: unknown[]) => mockLookup(...args) }));
jest.mock("../../api/client", () => ({ ...jest.requireActual("../../api/client"), captureApiSessionGuard: () => () => true }));
jest.mock("../../services/assistedEvidenceVault", () => ({ sealAssistedPhoto: jest.fn(), removeAssistedPhoto: jest.fn() }));

const base: PendingAssistedEnrollment = {
  sponsorUserId: "sponsor-a", organizationId: "org-a",
  input: { first_name: "Ana", last_name: "López", email: "ana@example.com", client_request_id: "request-a", consent_confirmed: true },
  photos: [{ evidenceType: "id_document_front", mimeType: "image/jpeg", fileName: "f.sealed", keyName: "f-key" }],
};

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><AssistedOfflineScreen /></QueryClientProvider>);
  return { screen, client };
}

beforeEach(() => {
  mockOrganization = { id: "org-a" };
  onlineManager.setOnline(false);
  mockItem = { ...base, createAttempted: true, blocked: { reason: "assisted_enrollment_unavailable", at: "2026-10-26T12:00:00Z" } };
  mockLookup.mockResolvedValue(null);
});
afterEach(() => { onlineManager.setOnline(true); jest.restoreAllMocks(); jest.clearAllMocks(); });

it("explains the refusal, keeps the saved photo, and offers retry and discard instead of the plain delete", async () => {
  const { screen, client } = await renderScreen();
  await waitFor(() => expect(screen.getByTestId("assisted-blocked")).toBeTruthy());
  expect(screen.getByText("Registro asistido no disponible en esta organización")).toBeTruthy();
  expect(screen.getByText(/No se volverá a enviar automáticamente/)).toBeTruthy();
  expect(screen.getByText("✓ Foto guardada en este teléfono")).toBeTruthy();
  expect(screen.getByText("Descartar")).toBeTruthy();
  expect(screen.queryByText("Eliminar copia local")).toBeNull();
  await screen.unmount();
  client.clear();
});

it("discard asks first: cancelling keeps everything, confirming deletes only the local copy", async () => {
  const alert = jest.spyOn(Alert, "alert");
  const { screen, client } = await renderScreen();
  await waitFor(() => expect(screen.getByText("Descartar")).toBeTruthy());

  await fireEvent.press(screen.getByText("Descartar"));
  // The server is asked first (read-only, same request id); its answer shapes the confirmation.
  await waitFor(() => expect(alert).toHaveBeenCalledWith("Descartar registro guardado", discardConfirmation(mockItem, { kind: "not_found" }), expect.any(Array)));
  expect(mockLookup).toHaveBeenCalledWith("request-a");
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  buttons.find((button) => button.text === "Cancelar")?.onPress?.();
  expect(removePendingAssisted).not.toHaveBeenCalled();

  buttons.find((button) => button.text === "Descartar")?.onPress?.();
  await waitFor(() => expect(removePendingAssisted).toHaveBeenCalledWith("request-a"));
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  await screen.unmount();
  client.clear();
});

it("retry clears the stop so the next sync from Red sends it again", async () => {
  const { screen, client } = await renderScreen();
  await waitFor(() => expect(screen.getByText("Reintentar envío")).toBeTruthy());
  await fireEvent.press(screen.getByText("Reintentar envío"));
  await waitFor(() => expect(retryBlockedAssisted).toHaveBeenCalledWith("request-a"));
  await waitFor(() => expect(screen.queryByTestId("assisted-blocked")).toBeNull());
  expect(screen.getByText("Eliminar copia local")).toBeTruthy();
  await screen.unmount();
  client.clear();
});

it("kyc_unavailable is explained as paused identity verification", async () => {
  mockItem = { ...base, createAttempted: true, enrollmentId: "enrollment-a", blocked: { reason: "kyc_unavailable", at: "2026-10-26T12:00:00Z" } };
  const { screen, client } = await renderScreen();
  await waitFor(() => expect(screen.getByText("Verificación de identidad pausada en esta organización")).toBeTruthy());
  await screen.unmount();
  client.clear();
});

it("assisted_access_claimed: explains the person continues on their own, offers discard only", async () => {
  mockItem = { ...base, createAttempted: true, enrollmentId: "enrollment-a", blocked: { reason: "assisted_access_claimed", at: "2026-10-27T12:00:00Z" } };
  mockLookup.mockResolvedValue({ id: "enrollment-a", affiliate_id: "a", affiliate_code: "AFF1", first_name: "Ana", last_name: "López", affiliate_status: "pending", access_status: "ready", created_at: "" });
  const alert = jest.spyOn(Alert, "alert");
  const { screen, client } = await renderScreen();
  await waitFor(() => expect(screen.getByText("La persona ya activó su cuenta")).toBeTruthy());
  expect(screen.queryByText("Reintentar envío")).toBeNull();
  await fireEvent.press(screen.getByText("Descartar"));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(alert.mock.calls[0][1]).toMatch(/existe en la organización y la persona ya activó su cuenta.*solo borra la copia de este teléfono.*se conservan en el servidor/);
  await screen.unmount();
  client.clear();
});

describe("the confirmation says what stays on the server", () => {
  it("nothing was ever sent, or the server confirmed nothing exists", () => {
    expect(discardConfirmation(base)).toMatch(/^No se creó ningún registro en la organización/);
    // Without a server answer, an earlier creation refusal alone does not claim it.
    expect(discardConfirmation({ ...base, createAttempted: true, blocked: { reason: "assisted_enrollment_unavailable", at: "" } })).toMatch(/^No pudimos confirmar/);
  });

  it("the enrollment exists: only this phone's copy goes, the server keeps the record and what was sent", () => {
    expect(discardConfirmation({ ...base, createAttempted: true, enrollmentId: "enrollment-a", blocked: { reason: "kyc_unavailable", at: "" } }))
      .toMatch(/ya existe en la organización.*solo borra la copia de este teléfono.*se conservan en el servidor/);
  });

  it("a request left the phone without a clear answer: never claims nothing was created", () => {
    const text = discardConfirmation({ ...base, createAttempted: true });
    expect(text).toMatch(/^No pudimos confirmar si el registro de Ana López llegó a crearse/);
    expect(text).not.toMatch(/No se creó/);
  });
});

describe("assisted enrollment switched off in the organization", () => {
  it("a draft that never left the phone: says why it cannot be sent, takes no new photo or location, and only deletes on request", async () => {
    mockOrganization = { id: "org-a", assisted_enrollment_available: false };
    mockItem = { ...base };
    const { screen, client } = await renderScreen();
    await waitFor(() => expect(screen.getByTestId("assisted-held")).toBeTruthy());
    expect(screen.getByText(/este registro no puede enviarse/)).toBeTruthy();
    expect(screen.queryByText(/^Capturar: /)).toBeNull();
    expect(screen.queryByText(/^Volver a tomar: /)).toBeNull();
    expect(screen.queryByText(/Compartir ubicación con consentimiento/)).toBeNull();
    expect(screen.getByText("✓ Foto guardada en este teléfono")).toBeTruthy();
    expect(screen.getByText("Eliminar copia local")).toBeTruthy();
    expect(removePendingAssisted).not.toHaveBeenCalled();
    await screen.unmount();
    client.clear();
  });

  it("a refused draft offers no retry while the setting is off", async () => {
    mockOrganization = { id: "org-a", assisted_enrollment_available: false };
    const { screen, client } = await renderScreen();
    await waitFor(() => expect(screen.getByTestId("assisted-blocked")).toBeTruthy());
    expect(screen.queryByText("Reintentar envío")).toBeNull();
    expect(screen.getByText("Descartar")).toBeTruthy();
    await screen.unmount();
    client.clear();
  });

  it("a draft already created on the server is not held: capture stays available", async () => {
    mockOrganization = { id: "org-a", assisted_enrollment_available: false };
    mockItem = { ...base, createAttempted: true, enrollmentId: "enrollment-a" };
    const { screen, client } = await renderScreen();
    await waitFor(() => expect(screen.getByText("Capturar: Reverso de INE")).toBeTruthy());
    expect(screen.queryByTestId("assisted-held")).toBeNull();
    await screen.unmount();
    client.clear();
  });
});
