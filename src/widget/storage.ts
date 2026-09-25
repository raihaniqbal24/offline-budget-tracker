/**
 * The one file the widget reads (FR-14.8). It lives in the app's own storage,
 * so nothing leaves the device, and it holds only the few numbers the widget
 * draws: no entries, notes or account names.
 */
import { File, Paths } from "expo-file-system";
import { parseSummary, type WidgetSummary } from "./summary";

const FILE_NAME = "widget-summary.json";

function file(): File {
  return new File(Paths.document, FILE_NAME);
}

export async function writeSummary(summary: WidgetSummary): Promise<void> {
  try {
    const target = file();
    target.create({ overwrite: true });
    target.write(JSON.stringify(summary));
  } catch {
    // The widget is never allowed to break the app (FR-14.9).
  }
}

/** Null when nothing has been written yet, or the file can't be trusted. */
export async function readSummary(): Promise<WidgetSummary | null> {
  try {
    const source = file();
    if (!source.exists) return null;
    return parseSummary(JSON.parse(await source.text()));
  } catch {
    return null;
  }
}
