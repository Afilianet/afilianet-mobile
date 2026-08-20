import { Button } from "./ui/Button";

export function RetryButton({ onPress, loading }: { onPress: () => void; loading?: boolean }) {
  return <Button label="Try again" variant="secondary" onPress={onPress} loading={loading} />;
}
