import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import type { EvidenceType } from "../types/api";
import { secureStorage } from "./storage";

export interface AssistedPhoto {
  evidenceType: Extract<EvidenceType, "id_document_front" | "id_document_back">;
  mimeType: string;
  fileName: string;
  keyName: string;
}

/** Camera files are temporary; only AES-GCM sealed bytes survive offline. */
export async function sealAssistedPhoto(
  evidenceType: AssistedPhoto["evidenceType"], mimeType: string, uri: string,
): Promise<AssistedPhoto> {
  const source = new File(uri);
  if (!source.size || source.size > 8 * 1024 * 1024) throw new Error("La foto está vacía o pesa más de 8 MB.");
  const key = await AESEncryptionKey.generate();
  const sealed = await aesEncryptAsync(await source.bytes(), key);
  const id = randomUUID();
  const photo: AssistedPhoto = {
    evidenceType, mimeType, fileName: `afn-assisted-${id}.sealed`, keyName: `afn.assisted.photo.${id}`,
  };
  const target = new File(Paths.document, photo.fileName);
  try {
    await secureStorage.set(photo.keyName, await key.encoded("hex"));
    target.create({ overwrite: false });
    target.write(await sealed.combined());
    source.delete();
    return photo;
  } catch (error) {
    if (target.exists) target.delete();
    await secureStorage.remove(photo.keyName);
    throw error;
  }
}

export async function openAssistedPhoto(photo: AssistedPhoto): Promise<Uint8Array> {
  const keyHex = await secureStorage.get(photo.keyName);
  if (!keyHex) throw new Error("No se encontró la clave local de la foto. Vuelve a capturarla.");
  const key = await AESEncryptionKey.import(keyHex, "hex");
  const file = new File(Paths.document, photo.fileName);
  if (!file.exists) throw new Error("No se encontró la foto guardada. Vuelve a capturarla.");
  const sealed = AESSealedData.fromCombined(await file.bytes());
  return aesDecryptAsync(sealed, key);
}

export async function removeAssistedPhoto(photo: AssistedPhoto): Promise<void> {
  // Destroy the key first: an interrupted file delete leaves only unreadable sealed bytes.
  await secureStorage.remove(photo.keyName);
  const file = new File(Paths.document, photo.fileName);
  if (file.exists) file.delete();
}
