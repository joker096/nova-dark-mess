import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTextFile } from './download';

type PickerWindow = Window & { showSaveFilePicker?: unknown };

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
  delete (window as PickerWindow).showSaveFilePicker;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.restoreAllMocks();
});

describe('saveTextFile', () => {
  it('writes the phrase through the save dialog when the picker exists', async () => {
    const write = vi.fn<(data: string | Blob) => Promise<void>>(async () => undefined);
    const close = vi.fn<() => Promise<void>>(async () => undefined);
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => ({
      createWritable: async () => ({ write, close }),
    }));

    await expect(saveTextFile('nova-recovery-phrase.txt', 'word1 word2')).resolves.toBe('saved');
    expect(write).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('word1 word2');
  });

  it('reports a cancelled save dialog without falling back to a download', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    (window as PickerWindow).showSaveFilePicker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });

    await expect(saveTextFile('nova-recovery-phrase.txt', 'word1 word2')).resolves.toBe('cancelled');
    expect(click).not.toHaveBeenCalled();
  });

  it('falls back to a blob download when no save dialog is available', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:phrase');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await expect(saveTextFile('nova-recovery-phrase.txt', 'word1 word2')).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
