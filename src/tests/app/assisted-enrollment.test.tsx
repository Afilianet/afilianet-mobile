import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { createAssistedEnrollment } from "../../api/assistedEnrollment";
import { removePendingAssisted, savePendingAssisted } from "../../services/assistedQueue";
import AssistedEnrollmentScreen from "../../app/assisted-enrollment";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: mockReplace }) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "request-a" }));
jest.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "sponsor-a" } }) }));
jest.mock("../../state/OrganizationContext", () => ({ useOrganization: () => ({ activeOrganization: { id: "org-a" } }) }));
jest.mock("../../api/assistedEnrollment", () => ({ createAssistedEnrollment: jest.fn() }));
jest.mock("../../services/assistedQueue", () => ({ savePendingAssisted: jest.fn(), removePendingAssisted: jest.fn() }));

const created = {
  id: "enrollment-a", affiliate_id: "affiliate-a", affiliate_code: "AFF100", first_name: "Ana", last_name: "López",
  affiliate_status: "pending", access_status: "pending" as const, created_at: "2026-10-16",
};

type Screen = Awaited<ReturnType<typeof render>>;

async function fill(screen: Screen, values: { email?: string; phone?: string }) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("Nombre"), " Ana ");
    fireEvent.changeText(screen.getByLabelText("Apellidos"), " López ");
    if (values.email !== undefined) fireEvent.changeText(screen.getByLabelText("Correo de la persona"), values.email);
    if (values.phone !== undefined) fireEvent.changeText(screen.getByLabelText("Celular de la persona"), values.phone);
    fireEvent.press(screen.getByText("Confirmar autorización de la persona"));
  });
}

async function submit(screen: Screen) {
  await act(async () => {
    fireEvent.press(screen.getByText("Registrar"));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (createAssistedEnrollment as jest.Mock).mockResolvedValue(created);
});

describe("Registrar a alguien -- contact cases", () => {
  it("sends only a normalized phone and explains phone access without claiming verification", async () => {
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { email: "   ", phone: " 55 1234-5678 " });
    await submit(screen);

    expect(createAssistedEnrollment).toHaveBeenCalledWith({
      first_name: "Ana", last_name: "López", phone: "+525512345678", client_request_id: "request-a", consent_confirmed: true,
    });
    expect(removePendingAssisted).toHaveBeenCalledWith("request-a");
    expect(screen.getByText("Afiliado registrado · AFF100")).toBeTruthy();
    expect(screen.getByText(/No se le envía ningún mensaje por ahora/)).toBeTruthy();
    expect(screen.getByText(/«¿Olvidaste tu contraseña\?», luego «Celular», escribir \+52 55 1234 5678/)).toBeTruthy();
    expect(screen.getByText(/^Su celular queda sin verificar/)).toBeTruthy();
    expect(screen.queryByText(/enlace/)).toBeNull();
    expect(screen.getByText("Verificar identidad ahora")).toBeTruthy();
  });

  it("sends only a lower-cased email and keeps the activation-link instructions", async () => {
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { email: " Ana@Example.COM " });
    await submit(screen);

    expect(createAssistedEnrollment).toHaveBeenCalledWith({
      first_name: "Ana", last_name: "López", email: "ana@example.com", client_request_id: "request-a", consent_confirmed: true,
    });
    expect(screen.getByText(/Recibirá en ana@example.com un enlace para crear su contraseña\./)).toBeTruthy();
    expect(screen.getByText(/^Su correo queda sin verificar/)).toBeTruthy();
    expect(screen.queryByText(/SMS/)).toBeNull();
  });

  it("sends both and explains both ways in", async () => {
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { email: "ana@example.com", phone: "5512345678" });
    await submit(screen);

    expect(createAssistedEnrollment).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@example.com", phone: "+525512345678" }));
    expect(screen.getByText(/Recibirá en ana@example.com un enlace.*Si prefiere usar su celular/)).toBeTruthy();
    expect(screen.getByText(/^Su correo y su celular quedan sin verificar/)).toBeTruthy();
  });

  it("requires at least one and never calls the API with neither", async () => {
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { email: "  ", phone: "  " });
    await submit(screen);

    expect(createAssistedEnrollment).not.toHaveBeenCalled();
    expect(screen.getByText("Escribe el correo, el celular o ambos.")).toBeTruthy();
  });

  it("marks an incomplete phone and a malformed email on their own fields", async () => {
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { email: "ana@", phone: "55 1234" });
    await submit(screen);

    expect(createAssistedEnrollment).not.toHaveBeenCalled();
    expect(screen.getByText("El correo no es válido.")).toBeTruthy();
    expect(screen.getByText("El celular no está completo para el país elegido.")).toBeTruthy();
  });

  it("still requires the witnessed consent", async () => {
    const screen = await render(<AssistedEnrollmentScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Nombre"), "Ana");
      fireEvent.changeText(screen.getByLabelText("Apellidos"), "López");
      fireEvent.changeText(screen.getByLabelText("Celular de la persona"), "5512345678");
    });
    await submit(screen);

    expect(createAssistedEnrollment).not.toHaveBeenCalled();
    expect(screen.getByText(/La persona debe estar presente y autorizar/)).toBeTruthy();
  });
});

describe("Registrar a alguien -- errors keep the form", () => {
  it("shows a duplicate phone on that field, keeps every value and retries with the same request id", async () => {
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(new ApiError(
      "validation", "Ya existe una cuenta con este número de celular.", 422,
      { phone: ["Ya existe una cuenta con este número de celular."] },
    ));
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { email: "ana@example.com", phone: "5512345678" });
    await submit(screen);

    expect(screen.getByText("Ya existe una cuenta con este número de celular.")).toBeTruthy();
    expect(screen.getByText("Revisa el correo o el celular marcados.")).toBeTruthy();
    expect(screen.getByLabelText("Nombre").props.value).toBe(" Ana ");
    expect(screen.getByLabelText("Correo de la persona").props.value).toBe("ana@example.com");
    expect(screen.getByLabelText("Celular de la persona").props.value).toBe("5512345678");
    expect(screen.getByText("Autorización confirmada ✓")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Celular de la persona"), "5587654321");
    });
    await submit(screen);
    expect(createAssistedEnrollment).toHaveBeenLastCalledWith(expect.objectContaining({ phone: "+525587654321", client_request_id: "request-a" }));
    expect(screen.getByText("Afiliado registrado · AFF100")).toBeTruthy();
  });

  it("queues a phone-only registration offline without claiming a message was sent", async () => {
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(new ApiError("offline", "offline"));
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { phone: "5512345678" });
    await submit(screen);

    expect(savePendingAssisted).toHaveBeenCalledWith({
      sponsorUserId: "sponsor-a", organizationId: "org-a",
      input: { first_name: "Ana", last_name: "López", phone: "+525512345678", client_request_id: "request-a", consent_confirmed: true },
    });
    expect(screen.getByText("Guardado en este teléfono")).toBeTruthy();
    expect(screen.getByText(/ni se le envió ningún mensaje/)).toBeTruthy();
  });

  it("an API before #63 that still requires email rejects phone-only: shown on the email field, nothing lost, nothing queued", async () => {
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(new ApiError(
      "validation", "The email field is required.", 422,
      { email: ["The email field is required."] },
    ));
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { phone: "5512345678" });
    await submit(screen);

    expect(screen.getByText("The email field is required.")).toBeTruthy();
    expect(screen.getByLabelText("Nombre").props.value).toBe(" Ana ");
    expect(screen.getByLabelText("Celular de la persona").props.value).toBe("5512345678");
    expect(screen.getByText("Autorización confirmada ✓")).toBeTruthy();
    expect(screen.queryByText(/Afiliado registrado/)).toBeNull();
    expect(savePendingAssisted).not.toHaveBeenCalled();
  });

  it("shows a generic server failure without discarding the form", async () => {
    (createAssistedEnrollment as jest.Mock).mockRejectedValueOnce(new ApiError("forbidden", "forbidden", 403));
    const screen = await render(<AssistedEnrollmentScreen />);
    await fill(screen, { phone: "5512345678" });
    await submit(screen);

    expect(screen.getByText("Registrar")).toBeTruthy();
    expect(screen.getByLabelText("Celular de la persona").props.value).toBe("5512345678");
    expect(savePendingAssisted).not.toHaveBeenCalled();
  });
});
