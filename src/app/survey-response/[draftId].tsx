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
  deleteDraft,
  getDownloaded,
  loadDraft,
  saveDraft,
  toSubmissionAnswers,
  validateAll,
  type DraftAudio,
  type SurveyDraft,
} from "../../features/surveys/library";
import { audioName, enqueueResponse } from "../../features/surveys/outbox";
import { useSurveyScope } from "../../features/surveys/runtime";
import type { AnswerValue, SurveyQuestion, SurveyVersion } from "../../features/surveys/types";
import { formatDuration, useInterviewRecorder } from "../../features/surveys/useInterviewRecorder";
import { removeItem, scopeId, StorageFullError, type SurveyScope } from "../../features/surveys/vault";
import { strings } from "../../i18n";
import { routes } from "../../navigation/routes";

const AUTOSAVE_MS = 600;

export default function SurveyResponseScreen() {
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  const scope = useSurveyScope();
  const copy = strings.surveys;
  const [loaded, setLoaded] = useState<{ scope: SurveyScope; draft: SurveyDraft; version: SurveyVersion } | null | undefined>(undefined);
  const [draft, setDraft] = useState<SurveyDraft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
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
      setLoaded({ scope, draft: stored, version: downloaded.version });
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
  const interview = version.modality === "interviewer";
  const recordingOffered = interview && version.recording.enabled;

  function setAnswer(questionId: string, value: AnswerValue) {
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
        onPress: () =>
          void removeItem(loaded.scope, audioName(audio.clientAudioId)).then(() => persist({ ...draft, audio: null })),
      },
    ]);
  }

  async function submit() {
    if (!draft || !loaded || saving) return;
    if (recorder.phase === "recording" || recorder.phase === "saving") {
      setMessage(copy.recording.stopBeforeSubmit);
      return;
    }
    const found = validateAll(version, draft.answers);
    setErrors(found);
    if (Object.keys(found).length) {
      setMessage(copy.form.fixErrors);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      await enqueueResponse(
        loaded.scope,
        {
          id: draft.id,
          surveyId: version.survey_id,
          versionId: version.id,
          surveyTitle: version.title,
          modality: version.modality,
          respondentLabel: interview ? draft.respondentLabel?.trim() || null : null,
          completedAt: new Date().toISOString(),
          recordingConsent: draft.recordingConsent === true,
          audio: draft.audio,
        },
        toSubmissionAnswers(version, draft.answers),
      );
      // The outbox now owns the answers and the audio; only the draft record goes.
      await deleteDraft(loaded.scope, draft.id);
      router.replace(routes.surveys as never);
    } catch (error) {
      setMessage(error instanceof StorageFullError ? error.message : copy.storageFull);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="survey-response-scroll">
        <Text style={styles.heading} accessibilityRole="header">{version.title}</Text>
        <SurveysPreviewNotice />

        {interview ? (
          <TextInput
            label={copy.respondentLabel}
            helperText={copy.respondentHint}
            value={draft.respondentLabel ?? ""}
            onChangeText={(value) => persist({ ...draft, respondentLabel: value })}
            maxLength={120}
          />
        ) : null}

        {recordingOffered && draft.recordingConsent === null ? (
          <Card style={styles.card} testID="recording-consent">
            <Text style={styles.cardTitle}>{copy.consent.title}</Text>
            <Text style={styles.body}>{copy.consent.read}</Text>
            <Text style={styles.consent}>{version.recording.consent_text}</Text>
            <Text style={styles.meta}>{copy.consent.note}</Text>
            <Button label={copy.consent.accept} onPress={() => persist({ ...draft, recordingConsent: true })} />
            <Button label={copy.consent.decline} variant="ghost" onPress={() => persist({ ...draft, recordingConsent: false })} />
          </Card>
        ) : null}

        {recordingOffered && draft.recordingConsent === true ? (
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
        <Button label={copy.form.submit} size="lg" fullWidth loading={saving} onPress={() => void submit()} />
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
  value: AnswerValue | undefined;
  error?: string;
  onChange: (value: AnswerValue) => void;
}) {
  const copy = strings.surveys.form;
  const selected = Array.isArray(value) ? value : [];

  return (
    <Card style={styles.card} testID={`question-${question.id}`}>
      <Text style={styles.meta}>{`${position} · ${question.required ? copy.required : copy.optional}`}</Text>
      <Text style={styles.cardTitle}>{question.prompt}</Text>
      {question.type === "single_choice"
        ? question.options.map((option) => (
            <Choice key={option.id} label={option.label} selected={value === option.id} role="radio" onPress={() => onChange(option.id)} />
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
          <Text style={styles.meta}>{copy.scaleHint(question.scale?.min ?? 1, question.scale?.max ?? 5)}</Text>
          <View style={styles.scale}>
            {range(question.scale?.min ?? 1, question.scale?.max ?? 5).map((number) => (
              <Choice key={number} label={String(number)} selected={value === number} role="radio" compact onPress={() => onChange(number)} />
            ))}
          </View>
        </>
      ) : null}
      {question.type === "open_text" ? (
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
