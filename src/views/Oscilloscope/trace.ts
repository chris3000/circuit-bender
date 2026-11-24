/** The slowest sweep shows this many seconds across the screen, so that much signal is kept. */
export const SCOPE_SECONDS = 10;

/** At most this many samples are looked at for one column of the screen. */
const SAMPLES_PER_COLUMN = 32;

/**
 * What each column of the screen shows of the newest `samples` samples in a
 * ring buffer: the lowest and highest value that fall in it, as
 * out[2c] and out[2c + 1]. A slow sweep puts hundreds of samples in a
 * column, and drawing only one of them would show a fast wave as noise; its
 * low and high draw it as the band it is. Columns from before anything was
 * recorded are NaN.
 *
 * `written` is how many samples have ever been put in the buffer: the newest
 * is at (written − 1) modulo its length.
 */
export function traceColumns(buffer: Float32Array, written: number, samples: number, columns: number, out: Float32Array): void {
  const capacity = buffer.length;
  const perColumn = samples / columns;
  const start = written - samples;
  const oldest = Math.max(0, written - capacity);
  for (let c = 0; c < columns; c++) {
    const from = start + c * perColumn;
    let low = NaN, high = NaN;
    if (perColumn <= 1) {
      const index = Math.min(written - 1, Math.round(from));
      if (index >= oldest) low = high = buffer[index % capacity];
    } else {
      const first = Math.max(oldest, Math.floor(from));
      const end = Math.min(written, Math.floor(from + perColumn));
      const stride = Math.max(1, Math.floor(perColumn / SAMPLES_PER_COLUMN));
      for (let i = first; i < end; i += stride) {
        const v = buffer[i % capacity];
        if (!(v >= low)) low = v;
        if (!(v <= high)) high = v;
      }
    }
    out[2 * c] = low;
    out[2 * c + 1] = high;
  }
}

/** A sweep speed as it is written on the panel: 5ms, 1s. */
export function formatSweep(ms: number): string {
  return ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`;
}
