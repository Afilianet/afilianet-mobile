import { apiOrigin, describeOrigin, isSendableOrigin, isUuid, legacyInboxOrigin, legacyOrigin } from "./origin";

jest.mock("./vault", () => ({ openJson: jest.fn(), sealJson: jest.fn() }));

describe("origin identity (decision A)", () => {
  it.each([
    ["https://staging-api.afilianet.mx", "api:https://staging-api.afilianet.mx"],
    ["https://staging-api.afilianet.mx/", "api:https://staging-api.afilianet.mx"],
    ["  HTTPS://Staging-API.Afilianet.MX:443//  ", "api:https://staging-api.afilianet.mx"],
    ["https://user:secret@staging-api.afilianet.mx/?x=1#y", "api:https://staging-api.afilianet.mx"],
    ["https://staging-api.afilianet.mx./", "api:https://staging-api.afilianet.mx"],
    ["https://api.afilianet.mx", "api:https://api.afilianet.mx"],
    ["http://192.168.1.20:8000", "api:http://192.168.1.20:8000"],
    ["http://192.168.1.20:80/", "api:http://192.168.1.20"],
    ["https://example.test/base//v2/", "api:https://example.test/base/v2"],
  ])("%s → %s: one stable identity per server", (url, origin) => {
    expect(apiOrigin(url)).toBe(origin);
    expect(isSendableOrigin(origin)).toBe(true);
  });

  it("staging, production, local servers and schemes never share an identity", () => {
    const origins = ["https://staging-api.afilianet.mx", "https://api.afilianet.mx", "http://staging-api.afilianet.mx", "https://staging-api.afilianet.mx:8443", "http://192.168.1.20:8000"].map(apiOrigin);
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("an unconfigured or malformed base URL can never send", () => {
    for (const url of ["", "staging-api.afilianet.mx", "://x"]) expect(isSendableOrigin(apiOrigin(url))).toBe(false);
    expect(isSendableOrigin("unconfirmed")).toBe(false);
    expect(isSendableOrigin(undefined)).toBe(false);
    expect(isSendableOrigin("fixture")).toBe(true);
  });

  it("names origins in words, with a host only for an unknown server", () => {
    expect(describeOrigin("fixture")).toBe("datos de ejemplo");
    expect(describeOrigin("api:https://staging-api.afilianet.mx")).toBe("Afilianet (servidor de pruebas)");
    expect(describeOrigin("api:https://api.afilianet.mx")).toBe("Afilianet");
    expect(describeOrigin("api:http://192.168.1.20:8000")).toBe("el servidor 192.168.1.20:8000");
    expect(describeOrigin("unconfirmed")).toBe("Origen sin confirmar");
  });
});

describe("legacy classification (decision B)", () => {
  it("is sample data only for the exact historical sample pairs", () => {
    expect(legacyOrigin("fx-servicio", "fx-v-servicio-2")).toBe("fixture");
    expect(legacyOrigin("fx-vecinal", "fx-v-vecinal-1")).toBe("fixture");
    expect(legacyOrigin("fx-cerrada", "fx-v-cerrada-1")).toBe("fixture");
  });

  it.each([
    ["a UUID (never assumed staging or production)", "9b2f0c1e-0000-4000-8000-000000000001", "9b2f0c1e-0000-4000-8000-000000000002"],
    ["a sample-looking id that never existed", "fx-otra", "fx-v-otra-1"],
    ["a mismatched sample pair", "fx-servicio", "fx-v-vecinal-1"],
    ["missing ids", undefined, undefined],
    ["inherited object keys", "x", "toString"],
  ])("anything else is unconfirmed: %s", (_case, surveyId, versionId) => {
    expect(legacyOrigin(surveyId, versionId)).toBe("unconfirmed");
  });

  it("a saved inbox is sample data only when every entry is a known sample pair", () => {
    expect(legacyInboxOrigin([{ survey_id: "fx-servicio", id: "fx-v-servicio-2" }, { survey_id: "fx-vecinal", id: "fx-v-vecinal-1" }])).toBe("fixture");
    expect(legacyInboxOrigin([{ survey_id: "fx-servicio", id: "fx-v-servicio-2" }, { survey_id: "s", id: "9b2f0c1e-0000-4000-8000-000000000002" }])).toBe("unconfirmed");
    expect(legacyInboxOrigin([])).toBe("unconfirmed");
  });

  it("recognizes the contract's UUIDs, case-insensitively", () => {
    expect(isUuid("9B2F0C1E-0000-4000-8000-00000000000A")).toBe(true);
    expect(isUuid("fx-v-servicio-2")).toBe(false);
    expect(isUuid("9b2f0c1e-0000-4000-8000-00000000000")).toBe(false);
  });
});
