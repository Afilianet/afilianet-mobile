import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AssistedOfflineScreen from "../../app/assisted-offline/[requestId]";
import { replaceAssistedPhoto } from "../../services/assistedQueue";

let mockPhotos: { evidenceType: string }[] = [];
const mockCapture = jest.fn();
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ requestId: "request-a" }), useRouter: () => ({ back: jest.fn() }) }));
jest.mock("expo-file-system", () => ({ File: class { size = 1000; } }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "sponsor-a" } }) }));
jest.mock("../../state/OrganizationContext", () => ({ useOrganization: () => ({ activeOrganization: { id: "org-a" } }) }));
jest.mock("../../hooks/useDocumentCamera", () => ({ useDocumentCamera: () => ({ capture: mockCapture }) }));
jest.mock("../../services/assistedQueue", () => ({
  listPendingAssisted: jest.fn(async () => [{ input: { client_request_id: "request-a", first_name: "Ana", last_name: "López" }, photos: [...mockPhotos] }]),
  replaceAssistedPhoto: jest.fn(async (_user, _org, _request, photo) => { mockPhotos = [...mockPhotos.filter((p) => p.evidenceType !== photo.evidenceType), photo]; }),
  removePendingAssisted: jest.fn(),
}));
jest.mock("../../services/assistedEvidenceVault", () => ({ sealAssistedPhoto: jest.fn(async (evidenceType) => ({ evidenceType, mimeType: "image/jpeg", fileName: "sealed", keyName: "key" })), removeAssistedPhoto: jest.fn() }));

beforeEach(() => {
  mockPhotos = [];
  mockCapture.mockResolvedValue({ status: "captured", uri: "file:///photo.jpg", width: 1944, height: 2592, mimeType: "image/jpeg" });
  onlineManager.setOnline(false);
});
afterEach(() => { onlineManager.setOnline(true); jest.clearAllMocks(); });

it("opens local records and refreshes persisted photo feedback while offline, including after reopening", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><AssistedOfflineScreen /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("0 de 2 fotos guardadas en este teléfono")).toBeTruthy());
  await fireEvent.press(screen.getByText("Capturar: Frente de INE"));
  await waitFor(() => expect(screen.getByText("1 de 2 fotos guardadas en este teléfono")).toBeTruthy());
  expect(replaceAssistedPhoto).toHaveBeenCalledWith("sponsor-a", "org-a", "request-a", expect.objectContaining({ evidenceType: "id_document_front" }));
  await fireEvent.press(screen.getByText("Capturar: Reverso de INE"));
  await waitFor(() => expect(screen.getByText("2 de 2 fotos guardadas en este teléfono")).toBeTruthy());
  await screen.unmount();
  client.clear();
  const reopened = await render(<QueryClientProvider client={client}><AssistedOfflineScreen /></QueryClientProvider>);
  await waitFor(() => expect(reopened.getByText("INE guardada en este teléfono")).toBeTruthy());
  expect(reopened.getAllByText("✓ Foto guardada en este teléfono")).toHaveLength(2);
  await reopened.unmount();
  client.clear();
});

it("does not report a captured photo as saved when persistence fails", async () => {
  (replaceAssistedPhoto as jest.Mock).mockRejectedValueOnce(new Error("No se pudo guardar la foto."));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const screen = await render(<QueryClientProvider client={client}><AssistedOfflineScreen /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByText("Capturar: Frente de INE")).toBeTruthy());
  await fireEvent.press(screen.getByText("Capturar: Frente de INE"));
  await waitFor(() => expect(screen.getByText("No se pudo guardar la foto.")).toBeTruthy());
  expect(screen.getByText("0 de 2 fotos guardadas en este teléfono")).toBeTruthy();
  expect(screen.queryByText("✓ Foto guardada en este teléfono")).toBeNull();
  await screen.unmount();
  client.clear();
});
