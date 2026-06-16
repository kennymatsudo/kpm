import { toast } from '../stores';

/**
 * Copy `value` to the clipboard and show a toast keyed off `label`.
 * Empty values surface as `${label} is empty` so silent no-ops are visible.
 */
export async function copyToClipboard(value: string, label: string): Promise<boolean> {
  if (!value) {
    toast.error(`${label} is empty`);
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
    return true;
  } catch {
    toast.error(`Failed to copy ${label.toLowerCase()}`);
    return false;
  }
}
