// EvidenceUploadConstraints' whitelist for id_document_front/back/page
// (config/evidence.php) -- mirrored here only for a fast client-side
// preflight; the backend independently enforces the same whitelist and
// remains authoritative (see EvidenceUploadService::requestUpload/complete).
const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/heic"] as const;

// config/evidence.php's `max_size_bytes.image` default -- a client-side
// early-reject only, never the source of truth (the backend rejects an
// oversized declared size at request time and the actual stored size again
// at completion time, regardless of what this check does).
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Resolves the MIME type to declare for a captured photo. `reportedMimeType`
 * is frequently null on-device (expo-image-picker doesn't always populate
 * it) -- camera capture reliably produces JPEG on both platforms, so that's
 * the safe default. If a mime type WAS reported and it's something other
 * than one of the three the backend actually whitelists, this refuses
 * (returns null) rather than silently mislabeling unknown bytes as JPEG.
 */
export function resolveMimeType(reportedMimeType: string | null | undefined): string | null {
  if (!reportedMimeType) return "image/jpeg";
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(reportedMimeType) ? reportedMimeType : null;
}

export interface CapturedAssetCheck {
  uri: string;
  width: number;
  height: number;
  fileSize: number | null | undefined;
}

/**
 * Lightweight, client-side-only preflight (section 6 of the phase brief):
 * file exists (a uri was returned), dimensions are available and positive,
 * and size is known and within the backend's declared limit. This never
 * duplicates the backend's real checks (decode, resolution, aspect ratio,
 * OCR, structural validation) -- it only catches an obviously empty/corrupt
 * capture before spending a round trip on it.
 */
export function validateCapturedAsset(asset: CapturedAssetCheck): { valid: true } | { valid: false; error: string } {
  if (!asset.uri) {
    return { valid: false, error: "No photo was captured. Please try again." };
  }
  if (!asset.width || !asset.height || asset.width <= 0 || asset.height <= 0) {
    return { valid: false, error: "That photo looks empty or corrupted. Please retake it." };
  }
  if (asset.fileSize === null || asset.fileSize === undefined || asset.fileSize <= 0) {
    return { valid: false, error: "That photo looks empty or corrupted. Please retake it." };
  }
  if (asset.fileSize > MAX_IMAGE_BYTES) {
    return { valid: false, error: "That photo is too large. Please retake it." };
  }
  return { valid: true };
}
