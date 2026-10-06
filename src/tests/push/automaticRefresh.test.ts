import { createAutomaticPushRefresh } from "../../services/automaticPushRefresh";
it("ignores native token feedback and foreground events during and after registration", async () => {
  let finish!: () => void;
  let clock = 1000;
  const register = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const refresh = createAutomaticPushRefresh(register, () => clock);
  refresh();
  for (let i = 0; i < 50; i++) refresh();
  expect(register).toHaveBeenCalledTimes(1);
  finish(); await Promise.resolve(); await Promise.resolve();
  refresh();
  expect(register).toHaveBeenCalledTimes(1);
  clock += 60000; refresh();
  expect(register).toHaveBeenCalledTimes(2);
  finish();
});
it("keeps failures bounded but permits a later automatic retry", async () => {
  let clock = 0;
  const register = jest.fn().mockRejectedValue(new Error("429"));
  const refresh = createAutomaticPushRefresh(register, () => clock);
  refresh(); await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 50; i++) refresh();
  expect(register).toHaveBeenCalledTimes(1);
  clock = 60000; refresh();
  expect(register).toHaveBeenCalledTimes(2);
  await Promise.resolve(); await Promise.resolve();
});
