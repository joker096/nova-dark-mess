/**
 * Saves a text file on the device.
 *
 * The object URL must stay alive after the synthetic click: browsers (and
 * Android WebViews in particular) start reading the blob asynchronously, so
 * revoking it immediately can cancel the download before it begins.
 */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
