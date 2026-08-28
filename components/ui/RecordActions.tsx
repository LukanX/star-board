import type { MouseEventHandler } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { recordActionButtonClassName, recordDeleteActionClassName } from "@/components/ui/recordStyles";

type RecordActionProps = {
  recordName: string;
  disabled?: boolean;
  pending?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function RecordEditAction({ recordName, disabled = false, onClick }: RecordActionProps) {
  return (
    <button
      aria-label={`Edit ${recordName}`}
      className={recordActionButtonClassName}
      disabled={disabled}
      onClick={onClick}
      title={`Edit ${recordName}`}
      type="button"
    >
      <Pencil aria-hidden="true" size={15} /> EDIT
    </button>
  );
}

export function RecordDeleteAction({ recordName, disabled = false, pending, onClick }: RecordActionProps) {
  const isPending = pending ?? disabled;

  return (
    <button
      aria-label={`Delete ${recordName}`}
      className={recordDeleteActionClassName}
      disabled={disabled || isPending}
      onClick={onClick}
      title={`Delete ${recordName}`}
      type="button"
    >
      <Trash2 aria-hidden="true" size={14} /> {isPending ? "DELETING..." : "DELETE"}
    </button>
  );
}