import { strings } from "../i18n";
import { Button } from "./ui/Button";

export function RetryButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  return <Button label={strings.shared.tryAgain} variant="secondary" onPress={onPress} loading={loading} />;
}
