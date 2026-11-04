import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useAvailableSurveys } from "../../features/surveys/useAvailableSurveys";
import { strings } from "../../i18n";
import { routes, surveyDetail } from "../../navigation/routes";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { colors, spacing, typography } from "../ui/theme";

const HOME_SURVEYS = 3;

/**
 * Home's Encuestas card: each survey open right now in the active
 * organization that this account can answer, with its own access -- whether
 * or not it was distributed, and whether or not its notification arrived or
 * was dismissed (useAvailableSurveys, GET /surveys/available). The first few
 * are listed; the rest are in Encuestas.
 */
export function HomeSurveysCard() {
  const router = useRouter();
  const available = useAvailableSurveys();
  const surveys = available.kind === "ready" ? available.surveys : [];
  const shown = surveys.slice(0, HOME_SURVEYS);
  return (
    <Card style={styles.card} testID="home-surveys-entry">
      <Text style={styles.title}>{strings.surveys.title}</Text>
      {available.kind === "ready" ? (
        <Text style={styles.meta} testID="home-surveys-summary">
          {surveys.length ? strings.home.surveysAvailable(surveys.length) : strings.home.surveysNone}
        </Text>
      ) : available.kind === "error" ? (
        <Text style={styles.meta}>{strings.home.surveysLoadFailed}</Text>
      ) : (
        <Text style={styles.meta}>{strings.home.surveysDescription}</Text>
      )}
      {available.kind === "ready" && available.saved ? <Text style={styles.meta}>{strings.home.surveysSaved}</Text> : null}
      {shown.map((survey) => {
        const destination = surveyDetail(survey.survey_id);
        return (
          <View key={survey.survey_id} style={styles.row} testID={`home-survey-${survey.survey_id}`}>
            <Text style={styles.name} numberOfLines={2}>
              {survey.title}
            </Text>
            {destination ? (
              <Button
                label={strings.home.answerSurvey}
                accessibilityLabel={strings.home.answerSurveyA11y(survey.title)}
                size="sm"
                onPress={() => router.push(destination as never)}
              />
            ) : null}
          </View>
        );
      })}
      {surveys.length > HOME_SURVEYS ? <Text style={styles.meta}>{strings.home.moreSurveys(surveys.length - HOME_SURVEYS)}</Text> : null}
      <Button label={strings.home.openSurveys} variant="secondary" size="sm" onPress={() => router.push(routes.surveys as never)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  title: { ...typography.subtitle, color: colors.textPrimary },
  meta: { ...typography.body, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name: { ...typography.bodyStrong, color: colors.textPrimary, flexShrink: 1 },
});
