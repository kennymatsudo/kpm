import { toast } from '../stores/toastStore';

export function openExternalUrl(url: string): void {
  void window.api.shell.openExternal(url).then(
    (result) => {
      if (!result.success) toast.error(`Can't open link: ${url}`);
    },
    () => toast.error(`Can't open link: ${url}`)
  );
}
