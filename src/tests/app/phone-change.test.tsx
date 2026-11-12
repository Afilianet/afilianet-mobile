import { act, fireEvent, render } from "@testing-library/react-native";
import { ApiError } from "../../api/errors";
import { changePhone, verifyPhone } from "../../api/access";
import { PhoneChangeCard } from "../../components/account/PhoneChangeCard";
import type { User } from "../../types/api";

/**
 * Adding or changing the phone (PATCH /me/phone, ACCOUNT_ACCESS_CONTRACT §5):
 * Mexican format by default, the code confirmed with the existing
 * verify-phone, verified only from the server's user. Fictitious numbers.
 */
jest.mock("../../api/access", () => ({ ...jest.requireActual("../../api/access"), changePhone: jest.fn(), verifyPhone: jest.fn() }));
const patch = changePhone as jest.Mock;
const confirm = verifyPhone as jest.Mock;

const base: User = {
  id: "user-1", first_name: "Ana", last_name: "Prueba", email: "ana@example.test", phone: null,
  pending_email: null, pending_phone: null, email_verified_at: "2026-11-11T00:00:00Z", phone_verified_at: null,
} as unknown as User;

type View = Awaited<ReturnType<typeof render>>;
let refreshUser: jest.Mock;
async function mount(user: User) {
  let view!: View;
  await act(async () => { view = await render(<PhoneChangeCard user={user} refreshUser={refreshUser} />); });
  return view;
}
const press = async (view: View, text: string) => act(async () => { fireEvent.press(view.getByText(text)); });
const type = async (view: View, label: string, value: string) => act(async () => { fireEvent.changeText(view.getByLabelText(label), value); });

beforeEach(() => {
  jest.clearAllMocks();
  refreshUser = jest.fn(async () => ({ ...base, pending_phone: "+525512345678" }));
  patch.mockResolvedValue({ ...base, pending_phone: "+525512345678" });
});

describe("Agregar o cambiar celular", () => {
  it("email-only account: a Mexican number typed any common way goes as E.164; nothing is verified yet", async () => {
    const view = await mount(base);
    await press(view, "Agregar celular");
    await type(view, "Número de celular", "55 1234-5678");
    await press(view, "Enviar código");
    expect(patch).toHaveBeenCalledWith("+525512345678");
    expect(refreshUser).toHaveBeenCalled();
    expect(view.getByText(/Pedimos el envío de un código por SMS/)).toBeTruthy();
  });

  it("legacy Mexican prefixes (044, +52 1) are accepted; an incomplete number never reaches the API", async () => {
    const view = await mount(base);
    await press(view, "Agregar celular");
    await type(view, "Número de celular", "12345");
    await press(view, "Enviar código");
    expect(patch).not.toHaveBeenCalled();
    expect(view.getByText("Escribe un número de celular completo para el país elegido.")).toBeTruthy();
    await type(view, "Número de celular", "044 55 1234 5678");
    await press(view, "Enviar código");
    expect(patch).toHaveBeenCalledWith("+525512345678");
  });

  it("a number already used by another account: the API's message on the field, the form kept", async () => {
    patch.mockRejectedValue(new ApiError("validation", "x", 422, { phone: ["Ya existe una cuenta con este número de celular."] }));
    const view = await mount({ ...base, phone: "+525511112222", phone_verified_at: "2026-11-01T00:00:00Z" } as User);
    await press(view, "Cambiar celular");
    await type(view, "Número de celular", "5512345678");
    await press(view, "Enviar código");
    expect(view.getByText("Ya existe una cuenta con este número de celular.")).toBeTruthy();
    expect(view.getByLabelText("Número de celular").props.value).toBe("5512345678");
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it("SMS switched off (503 sms_unavailable): says nothing was saved", async () => {
    patch.mockRejectedValue(new ApiError("server", "x", 503, undefined, { reason: "sms_unavailable" }));
    const view = await mount(base);
    await press(view, "Agregar celular");
    await type(view, "Número de celular", "5512345678");
    await press(view, "Enviar código");
    expect(view.getByText("Por ahora no podemos enviar mensajes SMS, así que no se guardó el número. Inténtalo más tarde.")).toBeTruthy();
  });

  it("destination refused by the API (422 recipient_not_allowed, if served): clear copy, no code claimed", async () => {
    patch.mockRejectedValue(new ApiError("validation", "x", 422, undefined, { reason: "recipient_not_allowed" }));
    const view = await mount(base);
    await press(view, "Agregar celular");
    await type(view, "Número de celular", "5512345678");
    await press(view, "Enviar código");
    expect(view.getByText(/No podemos enviar códigos a este número. No se envió ningún código/)).toBeTruthy();
  });
});

describe("Confirmar el número pendiente", () => {
  const pendingUser = { ...base, pending_phone: "+525512345678" } as User;

  it("shows the pending number; a correct code is verified only once the server's user says so", async () => {
    confirm.mockResolvedValue(base);
    refreshUser.mockResolvedValue({ ...base, phone: "+525512345678", phone_verified_at: "2026-11-12T00:00:00Z", pending_phone: null });
    const view = await mount(pendingUser);
    expect(view.getByText("+52 55 1234 5678")).toBeTruthy();
    expect(view.getByText("Pendiente")).toBeTruthy();
    await type(view, "Código de verificación", "123 456");
    await press(view, "Verificar celular");
    expect(confirm).toHaveBeenCalledWith("123456");
    expect(view.getByText("Tu celular quedó verificado.")).toBeTruthy();
  });

  it("accepted but the server still shows it pending: never claims verified", async () => {
    confirm.mockResolvedValue(base);
    refreshUser.mockResolvedValue(pendingUser);
    const view = await mount(pendingUser);
    await type(view, "Código de verificación", "123456");
    await press(view, "Verificar celular");
    expect(view.queryByText("Tu celular quedó verificado.")).toBeNull();
    expect(view.getByText(/todavía no vemos tu celular verificado/)).toBeTruthy();
  });

  it.each([
    ["otp_invalid", "El código no es correcto. Revísalo e inténtalo de nuevo.", "123456"],
    ["otp_expired", "El código venció. Pide uno nuevo.", ""],
    ["otp_attempts_exceeded", "Hiciste demasiados intentos. Pide un código nuevo.", ""],
  ])("%s: its own message; a dead code is cleared", async (reason, message, left) => {
    confirm.mockRejectedValue(new ApiError("validation", "x", 422, undefined, { reason }));
    const view = await mount(pendingUser);
    await type(view, "Código de verificación", "123456");
    await press(view, "Verificar celular");
    expect(view.getByText(message)).toBeTruthy();
    expect(view.getByLabelText("Código de verificación").props.value).toBe(left);
  });

  it("another code goes to the same pending number; 429 shows the server's wait", async () => {
    patch.mockRejectedValueOnce(new ApiError("rate_limited", "x", 429, undefined, { retryAfterSeconds: 42 }));
    const view = await mount(pendingUser);
    await press(view, "Pedir otro código");
    expect(patch).toHaveBeenCalledWith("+525512345678");
    expect(view.getByText("Espera 42 segundos antes de intentarlo de nuevo.")).toBeTruthy();
    expect(view.getByText("Podrás pedir otro código en 42 s")).toBeTruthy();
  });

  it("a daily cap answered by the API (422 daily_limit_reached, if served): clear copy", async () => {
    patch.mockRejectedValueOnce(new ApiError("validation", "x", 422, undefined, { reason: "daily_limit_reached" }));
    const view = await mount(pendingUser);
    await press(view, "Pedir otro código");
    expect(view.getByText(/Ya pediste el máximo de códigos de hoy/)).toBeTruthy();
  });
});

it("the app never asks to read SMS: no READ_SMS or RECEIVE_SMS permission", () => {
  const app = require("../../../app.json") as { expo: { android?: { permissions?: string[] } } };
  const permissions = app.expo.android?.permissions ?? [];
  expect(permissions.some((permission) => /READ_SMS|RECEIVE_SMS/.test(permission))).toBe(false);
});

