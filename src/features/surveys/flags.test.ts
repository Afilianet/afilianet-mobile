/* eslint-disable @typescript-eslint/no-require-imports -- jest.resetModules() + require() re-evaluates the flag with different process.env values. */
describe("surveysPreviewEnabled", () => {
  const ORIGINAL_ENV = { ...process.env };

  function flagFor(appEnv: string, preview?: string): boolean {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, EXPO_PUBLIC_APP_ENV: appEnv };
    if (preview === undefined) delete process.env.EXPO_PUBLIC_SURVEYS_PREVIEW;
    else process.env.EXPO_PUBLIC_SURVEYS_PREVIEW = preview;
    return require("./flags").surveysPreviewEnabled;
  }

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("without a decision: on outside production, off in production (as before)", () => {
    expect(flagFor("staging")).toBe(true);
    expect(flagFor("internal")).toBe(true);
    expect(flagFor("production")).toBe(false);
  });

  it("«0» turns the sample surveys off even in a staging build (the store beta)", () => {
    expect(flagFor("staging", "0")).toBe(false);
    expect(flagFor("development", "0")).toBe(false);
  });

  it("«1» turns them on, also in production", () => {
    expect(flagFor("production", "1")).toBe(true);
  });
});
