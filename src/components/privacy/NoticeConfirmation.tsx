import { Checkbox } from "../ui/Checkbox";

/**
 * The one explicit confirmation a notice step asks for (API #91): the listed
 * versions were made available before continuing. Never preselected; it is
 * not a consent nor an acceptance of terms, and it does not claim the
 * documents were opened or read.
 */
export function NoticeConfirmation({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <Checkbox label={label} checked={checked} disabled={disabled} onChange={onChange} testID="notice-confirmation" />;
}
