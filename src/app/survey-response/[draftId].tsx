import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonGroup } from "../../components/Skeleton";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { TextInput } from "../../components/ui/TextInput";
import { colors, measures, radius, spacing, typography } from "../../components/ui/theme";
import { SurveysPreviewNotice } from "../../features/surveys/components";
import {
  audioApplies,
  deleteDraft,
  getDownloaded,
  loadDraft,
  missingRequired,
  saveDraft,
  toSubmissionAnswers,
  validateAll,
  type DraftAudio,
  type DraftValue,
  type SurveyDraft,
} from "../../features/surveys/library";
import { audioName, enqueueResponse } from "../../features/surveys/outbox";
import { useSurveyScope } from "../../features/surveys/runtime";
import type { SurveyQuestion, SurveyVersion } from "../../features/surveys/types";
import { formatDuration, useInterviewRecorder } from "../../features/surveys/useInterviewRecorder";
import { removeItem, scopeId, StorageFullError, type SurveyScope } from "../../features/surveys/vault";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";

const AUTOSAVE_MS = 600;

/**
 * One response, captured fully offline from the downloaded version.
 * - Self responses must answer every required question.
 * - Interviews may be saved incomplete after an explicit warning: missing
 *   answers go as `skipped` (the server flags omissions for review; it never
 *   rejects them).
 * - Audio only for interviews whose version records audio, only after the
 *   consent was accepted; the decision is final once submitted.
 */
export default function SurveyResponseScreen() {
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const scope = useSurveyScope();
  const copy = strings.surveys;
  const [loaded, setLoaded] = useState<{ scope: SurveyScope; version: SurveyVersion } | null | undefined>(undefined);
  const [draft, setDraft] = useState<SurveyDraft | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The draft belongs to the account+organization it was loaded under; if
  // the session switches away, this screen stops reading or writing it.
  const sameScope = Boolean(loaded && scope && scopeId(loaded.scope) === scopeId(scope));

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!scope || !draftId) return;
      const stored = await loadDraft(scope, draftId);
      const downloaded = stored ? await getDownloaded(scope, stored.surveyId) : null;
      if (!active) return;
      if (!stored || !downloaded || downloaded.version.id !== stored.versionId) {
        setLoaded(null);
        setMessage(!stored ? copy.form.draftMissing : copy.form.versionMissing);
        return;
      }
      setLoaded({ scope, version: downloaded.version });
      setDraft(stored);
    })();
    return () => {
      active = false;
    };
  }, [scope, draftId, copy.form.draftMissing, copy.form.versionMissing]);

  const persist = useCallback(
    (next: SurveyDraft) => {
      setDraft(next);
      setDraftSaved(false);
      if (!loaded || !sameScope) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        void saveDraft(loaded.scope, next)
          .then(() => setDraftSaved(true))
          .catch((error) => setMessage(error instanceof StorageFullError ? error.message : copy.storageFull));
      }, AUTOSAVE_MS);
    },
    [loaded, sameScope, copy.storageFull],
  );

  useEffect(() => () => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
  }, []);

  const onAudioSaved = useCallback(
    (audio: DraftAudio) => {
      setDraft((current) => {
        if (!current || !loaded) return current;
        const next = { ...current, audio };
        // Audio is saved immediately (not debounced): it must never exist without its draft.
        void saveDraft(loaded.scope, next).then(() => setDraftSaved(true));
        return next;
      });
    },
    [loaded],
  );
  const recorder = useInterviewRecorder(sameScope && loaded ? loaded.scope : null, onAudioSaved);

  if (loaded === undefined) return <SkeletonGroup lines={5} />;
  if (loaded === null || !draft) return <EmptyState title={copy.title} description={message ?? copy.form.draftMissing} />;
  if (!sameScope) return <EmptyState title={copy.title} description={copy.form.draftMissing} />;

  const { version } = loaded;
  const interview = draft.respondentType === "interviewed_external";
  const withAudio = audioApplies(version, draft.respondentType);

  function setAnswer(questionId: number, value: DraftValue) {
    if (!draft) return;
    persist({ ...draft, answers: { ...draft.answers, [questionId]: value } });
    if (errors[questionId]) setErrors(({ [questionId]: _removed, ...rest }) => rest);
  }

  function deleteAudio() {
    if (!draft?.audio || !loaded) return;
    const audio = draft.audio;
    Alert.alert(copy.recording.deleteAudio, copy.recording.deleteAudioConfirm, [
      { text: copy.signOut.cancel, style: "cancel" },
      {
        text: copy.recording.deleteAudio,
        style: "destructive",
        onPress: () => void removeItem(loaded.scope, audioName(audio.clientAudioId)).then(() => persist({ ...draft, audio: null })),
      },
    ]);
  }

  async function save() {
    if (!draft || !loaded) return;
    setSaving(true);
    setMessage(null);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      const consentAudio = withAudio ? draft.consentAudio ?? "declined" : null;
      await enqueueResponse(
        loaded.scope,
        {
          id: draft.id,
          surveyId: version.survey_id,
          versionId: version.id,
          surveyTitle: version.title,
          respondentType: draft.respondentType,
          consentAudio,
          completedAt: new Date().toISOString(),
          // Never send audio without an accepted consent.
          audio: consentAudio === "accepted" ? draft.audio : null,
        },
        toSubmissionAnswers(version, draft.answers),
      );
      if (draft.audio && consentAudio !== "accepted") await removeItem(loaded.scope, audioName(draft.audio.clientAudioId));
      // The outbox now owns the answers and the audio; only the draft record goes.
      await deleteDraft(loaded.scope, draft.id);
      router.replace(routes.surveys as never);
    } catch (error) {
      setMessage(error instanceof StorageFullError ? error.message : copy.storageFull);
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    if (!draft || saving) return;
    if (recorder.phase === "recording" || recorder.phase === "saving") {
      setMessage(copy.recording.stopBeforeSubmit);
      return;
    }
    // Self responses must be complete; interviews may be saved with omissions.
    const found = validateAll(version, draft.answers, !interview);
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage(copy.form.fixErrors);
      return;
    }
    const missing = interview ? missingRequired(version, draft.answers) : [];
    if (missing.length) {
      Alert.alert(copy.form.incompleteTitle, copy.form.incompleteBody(missing.length), [
        { text: copy.form.keepAnswering, style: "cancel" },
        { text: copy.form.saveIncomplete, onPress: () => void save() },
      ]);
      return;
    }
    void save();
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="survey-response-scroll">
        <Text style={styles.heading} accessibilityRole="header">{version.title}</Text>
        <Text style={styles.meta}>{interview ? copy.availability.interview : copy.availability.self}</Text>
        <SurveysPreviewNotice />
        {version.instructions ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>{copy.form.instructions}</Text>
            <Text style={styles.body}>{version.instructions}</Text>
          </Card>
        ) : null}

        {withAudio && draft.consentAudio === null ? (
          <Card style={styles.card} testID="recording-consent">
            <Text style={styles.cardTitle}>{copy.consent.title}</Text>
            <Text style={styles.body}>{version.consent_text ? copy.consent.read : copy.consent.noText}</Text>
            {version.consent_text ? <Text style={styles.consent}>{version.consent_text}</Text> : null}
            <Text style={styles.meta}>{copy.consent.note}</Text>
            <Text style={styles.meta}>{copy.consent.final}</Text>
            <Button label={copy.consent.accept} onPress={() => persist({ ...draft, consentAudio: "accepted" })} />
            <Button label={copy.consent.decline} variant="ghost" onPress={() => persist({ ...draft, consentAudio: "declined" })} />
          </Card>
        ) : null}

        {withAudio && draft.consentAudio === "accepted" ? (
          <Card style={styles.card} testID="recording-controls">
            {recorder.phase === "recording" ? (
              <View
                style={styles.recording}
                accessible
                accessibilityRole="alert"
                accessibilityLabel={copy.recording.activeA11y(formatDuration(recorder.elapsedMs))}
                testID="recording-indicator"
              >
                <Text style={styles.recordingText}>{copy.recording.active(formatDuration(recorder.elapsedMs))}</Text>
              </View>
            ) : null}
            {recorder.message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{recorder.message}</Text> : null}
            {recorder.canOpenSettings ? <Button label={copy.recording.openSettings} variant="ghost" size="sm" onPress={recorder.openSettings} /> : null}
            {recorder.phase === "recording" ? (
              <Button label={copy.recording.stop} variant="danger" onPress={() => void recorder.stop()} />
            ) : draft.audio ? (
              <>
                <Text style={styles.body}>{copy.recording.saved(formatDuration(draft.audio.durationMs))}</Text>
                <Button label={copy.recording.deleteAudio} variant="ghost" size="sm" onPress={deleteAudio} />
              </>
            ) : (
              <Button label={copy.recording.start} variant="secondary" loading={recorder.phase === "starting" || recorder.phase === "saving"} onPress={() => void recorder.start()} />
            )}
          </Card>
        ) : null}

        {version.questions.map((question, index) => (
          <QuestionField
            key={question.id}
            question={question}
            position={copy.form.progress(index + 1, version.questions.length)}
            value={draft.answers[question.id]}
            error={errors[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
          />
        ))}

        {draftSaved ? <Text style={styles.meta}>{copy.form.draftSaved}</Text> : null}
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        <Button label={copy.form.submit} size="lg" fullWidth loading={saving} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function QuestionField({
  question,
  position,
  value,
  error,
  onChange,
}: {
  question: SurveyQuestion;
  position: string;
  value: DraftValue | undefined;
  error?: string;
  onChange: (value: DraftValue) => void;
}) {
  const copy = strings.surveys.form;
  const selected = Array.isArray(value) ? value : [];
  const scaleMin = question.scale_min ?? 1;
  const scaleMax = question.scale_max ?? 5;

  return (
    <Card style={styles.card} testID={`question-${question.id}`}>
      <Text style={styles.meta}>{`${position} · ${question.required ? copy.required : copy.optional}`}</Text>
      <Text style={styles.cardTitle}>{question.prompt}</Text>
      {question.type === "single_choice"
        ? question.options.map((option) => (
            <Choice key={option.id} label={option.label} selected={selected[0] === option.id} role="radio" onPress={() => onChange([option.id])} />
          ))
        : null}
      {question.type === "multiple_choice"
        ? question.options.map((option) => (
            <Choice
              key={option.id}
              label={option.label}
              selected={selected.includes(option.id)}
              role="checkbox"
              onPress={() => onChange(selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id])}
            />
          ))
        : null}
      {question.type === "scale" ? (
        <>
          <Text style={styles.meta}>{copy.scaleHint(scaleMin, scaleMax)}</Text>
          <View style={styles.scale}>
            {range(scaleMin, scaleMax).map((number) => (
              <Choice key={number} label={String(number)} selected={value === number} role="radio" compact onPress={() => onChange(number)} />
            ))}
          </View>
        </>
      ) : null}
      {question.type === "number" ? (
        <TextInput
          label={copy.numberLabel}
          value={typeof value === "string" ? value : typeof value === "number" ? String(value) : ""}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          helperText={question.number_min !== null || question.number_max !== null ? strings.surveys.validation.numberRange(question.number_min, question.number_max) : undefined}
        />
      ) : null}
      {question.type === "text" ? (
        <TextInput label={copy.textLabel} value={typeof value === "string" ? value : ""} onChangeText={onChange} multiline maxLength={2000} />
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

function Choice({
  label,
  selected,
  role,
  compact = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  role: "radio" | "checkbox";
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.choice, compact ? styles.choiceCompact : null, selected ? styles.choiceSelected : null]}
    >
      <Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function range(min: number, max: number): number[] {
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: measures.mobileGutter, gap: spacing.md },
  heading: { ...typography.title, color: colors.textPrimary },
  card: { gap: spacing.sm },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  consent: { ...typography.body, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
  error: { ...typography.caption, color: colors.danger },
  recording: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.danger },
  recordingText: { ...typography.bodyStrong, color: colors.textOnBrand },
  scale: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  choiceCompact: { minWidth: 44, alignItems: "center" },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  choiceText: { ...typography.body, color: colors.textPrimary },
  choiceTextSelected: { ...typography.bodyStrong },
});
