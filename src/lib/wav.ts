/**
 * Encode Float32 PCM samples to a standard 16-bit mono WAV file.
 *
 * The companion app records microphone PCM via the Web Audio API so every
 * uploaded chunk has a complete, decodable WAV header. This avoids the
 * fragmented container problems that MediaRecorder timeslice chunks create.
 */

export function encodeWav(chunks: Float32Array[], inputSampleRate: number): Blob {
  const targetSampleRate = 16000;
  const mono = downsampleToMono(chunks, inputSampleRate, targetSampleRate);
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + mono.length * bytesPerSample);
  const view = new DataView(buffer);

  // "RIFF" chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + mono.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");

  // "fmt " sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); // Bits per sample

  // "data" sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, mono.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Naive mono + sample-rate conversion. Good enough for voice chunks. */
function downsampleToMono(
  chunks: Float32Array[],
  inputSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  const totalInput = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined = new Float32Array(totalInput);
  let pos = 0;
  for (const chunk of chunks) {
    combined.set(chunk, pos);
    pos += chunk.length;
  }

  if (inputSampleRate === targetSampleRate) return combined;

  const ratio = inputSampleRate / targetSampleRate;
  const length = Math.floor(totalInput / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const src = i * ratio;
    const idx = Math.floor(src);
    const frac = src - idx;
    const a = combined[idx] ?? 0;
    const b = combined[Math.min(idx + 1, totalInput - 1)] ?? 0;
    result[i] = a + (b - a) * frac;
  }
  return result;
}
