/**
 * When the app should lock and when it should ask (FR-13.2).
 *
 * Kept separate from the components because the rule has one awkward case:
 * the system's own authentication prompt sends the app to the background on
 * many phones. Treating that as "the user left" would lock the app during
 * its own prompt and ask again forever, so while a prompt is in flight the
 * background and foreground events are ignored.
 */

export type AppStatus = "active" | "background" | "inactive";

export interface LockState {
  /** Nothing of the app is shown while this is true. */
  locked: boolean;
  /** The system prompt is open right now. */
  prompting: boolean;
}

export const INITIAL_LOCKED: LockState = { locked: true, prompting: false };
export const UNLOCKED: LockState = { locked: false, prompting: false };

export interface Transition {
  state: LockState;
  /** Show the phone's authentication prompt now. */
  prompt: boolean;
}

/** The app started, or the setting changed while it was running. */
export function onSettingChanged(
  enabled: boolean,
  state: LockState,
): Transition {
  if (!enabled) return { state: UNLOCKED, prompt: false };
  // Turning the lock on from inside the app doesn't lock it there and then:
  // the user is already looking at it. The next return to the app asks.
  return { state: { ...state, locked: state.locked }, prompt: false };
}

/** The app's foreground status changed. */
export function onAppStatus(
  status: AppStatus,
  enabled: boolean,
  state: LockState,
): Transition {
  if (!enabled) return { state: UNLOCKED, prompt: false };
  if (state.prompting) return { state, prompt: false }; // our own prompt moved us

  if (status === "active") {
    return state.locked
      ? { state: { ...state, prompting: true }, prompt: true }
      : { state, prompt: false };
  }
  // FR-13.2: no grace period, so any trip away locks it again.
  return { state: { locked: true, prompting: false }, prompt: false };
}

/** The app opened while the lock is on. */
export function onStart(enabled: boolean): Transition {
  if (!enabled) return { state: UNLOCKED, prompt: false };
  return { state: { locked: true, prompting: true }, prompt: true };
}

/** The prompt closed. FR-13.6: anything but success leaves it locked. */
export function onAuthResult(success: boolean): Transition {
  return {
    state: success ? UNLOCKED : { locked: true, prompting: false },
    prompt: false,
  };
}

/** The user tapped the retry control on the lock screen. */
export function onRetry(state: LockState): Transition {
  if (!state.locked || state.prompting) return { state, prompt: false };
  return { state: { ...state, prompting: true }, prompt: true };
}
