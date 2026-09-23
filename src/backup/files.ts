/**
 * Getting files in and out of the app without any storage permission
 * (FR-9.2, FR-9.3): the share sheet, the system folder picker for saving,
 * and the system file picker for importing.
 */
import { Directory, File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";

export type Mime = "application/json" | "text/csv";

/** Write to the app's cache folder, then open the Android share sheet. */
export async function shareFile(
  name: string,
  content: string,
  mimeType: Mime,
): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

/**
 * Let the user pick a folder (for example Downloads or a Drive folder) and
 * save the file there. Returns false if they cancel.
 */
export async function saveToFolder(
  name: string,
  content: string,
  mimeType: Mime,
): Promise<boolean> {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch {
    return false; // picker closed without choosing
  }
  const file = directory.createFile(name, mimeType);
  file.write(content);
  return true;
}

/** Open the system file picker and read the chosen file as text. Null if cancelled. */
export async function pickTextFile(): Promise<{
  name: string;
  text: string;
} | null> {
  // Any type: Android file providers report .json files inconsistently, and
  // validateBackup refuses anything that isn't a backup anyway (FR-9.3).
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { name: asset.name, text: await new File(asset.uri).text() };
}
