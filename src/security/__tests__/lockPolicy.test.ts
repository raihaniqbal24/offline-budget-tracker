import {
  INITIAL_LOCKED,
  onAppStatus,
  onAuthResult,
  onRetry,
  onSettingChanged,
  onStart,
  UNLOCKED,
} from "../lockPolicy";

describe("app lock policy (FR-13)", () => {
  it("asks as soon as the app opens with the lock on", () => {
    expect(onStart(true)).toEqual({
      state: { locked: true, prompting: true },
      prompt: true,
    });
    expect(onStart(false)).toEqual({ state: UNLOCKED, prompt: false });
  });

  it("locks on leaving and asks on returning, with no grace period (FR-13.2)", () => {
    let t = onAppStatus("background", true, UNLOCKED);
    expect(t.state.locked).toBe(true);
    t = onAppStatus("active", true, t.state);
    expect(t).toEqual({
      state: { locked: true, prompting: true },
      prompt: true,
    });
  });

  it("ignores the trip away that the system prompt itself causes", () => {
    const prompting = { locked: true, prompting: true };
    expect(onAppStatus("background", true, prompting)).toEqual({
      state: prompting,
      prompt: false,
    });
    expect(onAppStatus("active", true, prompting)).toEqual({
      state: prompting,
      prompt: false,
    });
  });

  it("stays locked after a failed or cancelled prompt, and retries on request (FR-13.6)", () => {
    const failed = onAuthResult(false);
    expect(failed.state).toEqual({ locked: true, prompting: false });
    expect(onRetry(failed.state)).toEqual({
      state: { locked: true, prompting: true },
      prompt: true,
    });
    expect(onAuthResult(true).state).toEqual(UNLOCKED);
  });

  it("does not ask twice while already unlocked", () => {
    expect(onAppStatus("active", true, UNLOCKED)).toEqual({
      state: UNLOCKED,
      prompt: false,
    });
    expect(onRetry(UNLOCKED)).toEqual({ state: UNLOCKED, prompt: false });
  });

  it("turning the setting on does not lock the user out of the screen they are on", () => {
    expect(onSettingChanged(true, UNLOCKED)).toEqual({
      state: UNLOCKED,
      prompt: false,
    });
  });

  it("turning the setting off unlocks everything at once (FR-13.10)", () => {
    expect(onSettingChanged(false, INITIAL_LOCKED)).toEqual({
      state: UNLOCKED,
      prompt: false,
    });
    expect(onAppStatus("background", false, UNLOCKED).state).toEqual(UNLOCKED);
  });
});
