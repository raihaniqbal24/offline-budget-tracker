/**
 * The phone's own screen lock (FR-13.3, FR-13.7). The app never stores a PIN,
 * a password or anything biometric: it only asks Android to confirm the user,
 * and gets back yes or no.
 *
 * Loaded lazily, like the notification module, so a runtime without these
 * native libraries (Expo Go) still starts.
 */
import type * as LocalAuthenticationModule from "expo-local-authentication";
import type * as ScreenCaptureModule from "expo-screen-capture";
import i18n from "../i18n";

const SECURE_KEY = "app-lock";

function auth(): typeof LocalAuthenticationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-local-authentication") as typeof LocalAuthenticationModule;
  } catch {
    return null;
  }
}

function capture(): typeof ScreenCaptureModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-screen-capture") as typeof ScreenCaptureModule;
  } catch {
    return null;
  }
}

/**
 * FR-13.4: the setting only makes sense when the phone has a screen lock.
 * Any enrolled method counts, from a PIN to a fingerprint.
 */
export async function hasDeviceLock(): Promise<boolean> {
  const module = auth();
  if (!module) return false;
  try {
    return (await module.getEnrolledLevelAsync()) !== module.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/**
 * Ask the phone to confirm the user. `disableDeviceFallback: false` is what
 * lets a PIN, pattern or password work when no biometric is enrolled
 * (FR-13.3). A cancelled or failed prompt simply returns false (FR-13.6).
 */
export async function authenticate(
  reason: "open" | "export",
): Promise<boolean> {
  const module = auth();
  if (!module) return false;
  try {
    const result = await module.authenticateAsync({
      promptMessage: i18n.t(
        reason === "open" ? "lock.promptOpen" : "lock.promptExport",
      ),
      cancelLabel: i18n.t("common.cancel"),
      disableDeviceFallback: false,
      requireConfirmation: false,
    });
    return result.success === true;
  } catch {
    return false;
  }
}

/**
 * FR-13.5: Android's secure-window flag hides the app in the recents list and
 * blocks screenshots and screen recording. It follows the switch, so turning
 * the lock off restores all three.
 */
export async function setScreenProtection(on: boolean): Promise<void> {
  const module = capture();
  if (!module) return;
  try {
    if (on) await module.preventScreenCaptureAsync(SECURE_KEY);
    else await module.allowScreenCaptureAsync(SECURE_KEY);
  } catch {
    // Never let this stop the app: the lock itself still works.
  }
}
