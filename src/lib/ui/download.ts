/**
 * Saves a text file on the device.
 *
 * A synthetic `<a download>` click is the only option that works everywhere,
 * but many shells (Android WebViews, Tauri windows, sandboxed previews) silently
 * drop it: the click returns normally and no file appears. So before falling
 * back to it we use the two APIs that give the user visible feedback:
 *
 *   1. File System Access `showSaveFilePicker` — opens a real save dialog;
 *   2. Web Share with a file — opens the system share/save sheet on mobile.
 *
 * The returned outcome lets the caller describe what actually happened instead
 * of claiming a download that may never have started.
 */
export type TextSaveOutcome = 'saved' | 'shared' | 'downloaded' | 'cancelled' | 'failed';

interface WritableFileStream {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableFileStream>;
}

type ShowSaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileHandleLike>;

function isAbortError(error: unknown): boolean {
  // DOMException is not always an Error subclass (jsdom, older WebViews).
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

function extensionFor(mime: string): string {
  if (mime === 'text/plain') return '.txt';
  return '';
}

/** Triggers the legacy blob download. Returns false only if it throws. */
function downloadViaAnchor(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Browsers (and Android WebViews in particular) start reading the blob
    // asynchronously, so revoking it immediately can cancel the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

export async function saveTextFile(
  filename: string,
  content: string,
  mime = 'text/plain',
): Promise<TextSaveOutcome> {
  const type = `${mime};charset=utf-8`;
  const blob = new Blob([content], { type });

  const picker = (globalThis as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const extension = extensionFor(mime);
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'Text file', accept: { [mime]: extension ? [extension] : [] } }],
      });
      const writable = await handle.createWritable();
      // Write the string, not a Blob: some Android WebView builds accept the
      // Blob and finish without flushing any bytes, leaving an empty file.
      await writable.write(content);
      await writable.close();
      return 'saved';
    } catch (error) {
      // The user pressed cancel in the save dialog: report it, do not download.
      if (isAbortError(error)) return 'cancelled';
      // SecurityError / NotAllowedError (iframe without permission, unsupported
      // shell): fall through to the next strategy.
    }
  }

  // File sharing is the reliable mobile path: it opens the system sheet where
  // the user can save to Files/Drive or send the phrase somewhere safe.
  if (
    typeof File !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const file = new File([blob], filename, { type });
      const shareData = { files: [file], title: filename };
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      // Share failed for any other reason: fall through to the anchor.
    }
  }

  return downloadViaAnchor(blob, filename) ? 'downloaded' : 'failed';
}

/** Copies text, with an execCommand fallback for WebViews without the async API. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: try the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
