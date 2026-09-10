import { Image } from "expo-image";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { friendlyMessage, isApiError } from "../../../api/errors";
import type { CameraCaptureResult } from "../../../hooks/useDocumentCamera";
import { useEvidenceUploadFlow } from "../../../hooks/useEvidenceUploadFlow";
import { useSelfieCamera } from "../../../hooks/useSelfieCamera";
import { strings } from "../../../i18n";
import { analytics } from "../../../services/analytics";
import type { Evidence } from "../../../types/api";
import { resolveMimeType, validateCapturedAsset } from "../../../utils/documentCapture";
import { Button } from "../../ui/Button";
import { colors, radius, spacing, typography } from "../../ui/theme";
import { SELFIE_GUIDANCE } from "./faceMatchCopy";

type CapturedAsset = { uri: string; width: number; height: number; fileSize: number | null; mimeType: string | null };
type LocalStage =
  | { kind: "guidance" }
  | { kind: "permission_denied"; canAskAgain: boolean }
  | { kind: "unavailable" }
  | { kind: "preview"; asset: CapturedAsset }
  | { kind: "invalid"; error: string };

/**
 * Mirrors document-capture/CaptureScreen.tsx's exact structure (Phase 9C.2's
 * established pattern: the OS's own native camera UI already provides
 * shutter/preview/retake, so this app never builds a custom live camera
 * preview) -- the differences are front-facing capture (useSelfieCamera) and
 * face-specific, non-liveness guidance copy.
 *
 * `stepId` here is `face_match`'s own step id (Phase 9D.3.1) -- `selfie`
 * evidence is compatible with both `biometric_liveness` and `face_match`
 * (see StepEvidenceCompatibility in afilianet-api). Uploading directly
 * against face_match's own step means a Failed face_match retry keeps
 * working even once `biometric_liveness` has already passed (and is
 * therefore immutable) -- see FaceMatchCaptureFlow's docblock for the full
 * reasoning.
 */
export function SelfieCaptureScreen({
  stepId,
  onCancel,
  onUploaded,
}: {
  stepId: string;
  onCancel: () => void;
  onUploaded: (evidence: Evidence) => void;
}) {
  const [stage, setStage] = useState<LocalStage>({ kind: "guidance" });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const camera = useSelfieCamera();
  const uploadFlow = useEvidenceUploadFlow();

  async function handleOpenCamera() {
    setUploadError(null);
    const result: CameraCaptureResult = await camera.capture();

    if (result.status === "cancelled") {
      setStage({ kind: "guidance" });
      return;
    }
    if (result.status === "permission_denied") {
      setStage({ kind: "permission_denied", canAskAgain: true });
      return;
    }
    if (result.status === "unavailable") {
      setStage({ kind: "unavailable" });
      return;
    }

    const check = validateCapturedAsset({
      uri: result.uri,
      width: result.width,
      height: result.height,
      fileSize: result.fileSize,
    });
    if (!check.valid) {
      setStage({ kind: "invalid", error: check.error });
      return;
    }

    setStage({
      kind: "preview",
      asset: { uri: result.uri, width: result.width, height: result.height, fileSize: result.fileSize, mimeType: result.mimeType },
    });
  }

  async function handleUsePhoto(asset: CapturedAsset) {
    const mimeType = resolveMimeType(asset.mimeType);
    if (!mimeType) {
      setUploadError(strings.faceMatch.unsupportedFormat);
      return;
    }
    if (asset.fileSize === null) {
      setUploadError(strings.faceMatch.corruptedPhoto);
      return;
    }

    setUploadError(null);
    try {
      const evidence = await uploadFlow.upload({
        stepId,
        evidenceType: "selfie",
        uri: asset.uri,
        mimeType,
      });
      // No evidence id, step id, or any capture detail -- matches this
      // app's zero-property analytics convention for compliance events.
      analytics.capture("face_match_selfie_captured");
      onUploaded(evidence);
    } catch (error) {
      setUploadError(isApiError(error) ? friendlyMessage(error) : strings.faceMatch.uploadIncomplete);
    }
  }

  if (stage.kind === "preview") {
    const uploading = uploadFlow.stage !== "idle";
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{strings.faceMatch.yourSelfie}</Text>
        <Image
          source={{ uri: stage.asset.uri }}
          style={styles.preview}
          contentFit="cover"
          accessibilityLabel={strings.faceMatch.selfiePreviewA11y}
        />
        {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
        {uploading ? <Text style={styles.meta}>{uploadStageLabel(uploadFlow.stage)}</Text> : null}
        <View style={styles.actions}>
          <Button
            label={strings.faceMatch.retake}
            variant="secondary"
            disabled={uploading}
            onPress={() => setStage({ kind: "guidance" })}
          />
          <Button label={strings.faceMatch.useThisPhoto} loading={uploading} onPress={() => void handleUsePhoto(stage.asset)} />
        </View>
      </View>
    );
  }

  if (stage.kind === "permission_denied") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{strings.faceMatch.cameraAccessNeededTitle}</Text>
        <Text style={styles.description}>{strings.faceMatch.cameraAccessNeeded}</Text>
        <View style={styles.actions}>
          <Button label={strings.common.cancel} variant="secondary" onPress={onCancel} />
          <Button label={strings.faceMatch.openSettings} onPress={() => void Linking.openSettings()} />
        </View>
      </View>
    );
  }

  if (stage.kind === "unavailable") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{strings.faceMatch.cameraUnavailableTitle}</Text>
        <Text style={styles.description}>{strings.faceMatch.cameraUnavailable}</Text>
        <Button label={strings.common.cancel} variant="secondary" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{strings.faceMatch.takeASelfie}</Text>
      <View style={styles.guidanceList} accessible accessibilityLabel={strings.faceMatch.selfieTipsA11y(SELFIE_GUIDANCE.join(". "))}>
        {SELFIE_GUIDANCE.map((tip) => (
          <Text key={tip} style={styles.guidanceItem}>
            {"•"} {tip}
          </Text>
        ))}
      </View>
      {stage.kind === "invalid" ? <Text style={styles.error}>{stage.error}</Text> : null}
      <View style={styles.actions}>
        <Button label={strings.common.cancel} variant="secondary" onPress={onCancel} />
        <Button label={strings.faceMatch.openCamera} onPress={() => void handleOpenCamera()} />
      </View>
    </View>
  );
}

function uploadStageLabel(stage: "idle" | "authorizing" | "uploading" | "completing"): string {
  switch (stage) {
    case "authorizing":
      return strings.faceMatch.uploadStage.preparing;
    case "uploading":
      return strings.faceMatch.uploadStage.uploading;
    case "completing":
      return strings.faceMatch.uploadStage.confirming;
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
  },
  guidanceList: {
    gap: 4,
  },
  guidanceItem: {
    ...typography.body,
    color: colors.textSecondary,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  meta: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
