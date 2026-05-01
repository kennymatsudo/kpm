import { toast } from '../stores';

/**
 * Copy `value` to the clipboard and show a toast keyed off `label`.
 * Empty values surface as `${label} is empty` so silent no-ops are visible.
 */
  if (!value) {
    toast.error(`${label} is empty`);
  }
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`);
  }
}
