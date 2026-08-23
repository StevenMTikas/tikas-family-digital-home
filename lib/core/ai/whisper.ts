// Local speech-to-text for Voice (Voice.md) — replaces the browser Web
// Speech API, which on Chrome/Android sends audio to Google's servers and
// isn't actually on-device (see Future_Ideas.md and AssistantBubble.tsx's
// header comment on this file). Runs Whisper in-process via
// @huggingface/transformers (ONNX Runtime) — no Python, no native build step
// (unlike a whisper.cpp Node binding, which would reintroduce the
// build-toolchain pain already hit getting better-sqlite3 to compile on this
// host), no audio ever leaving the machine.
//
// Sibling to ./ollama.ts and ./frontier.ts: a standalone, independently
// swappable backend, not wired directly into index.ts's chat-streaming
// logic since transcription is a separate concern from replying.

import {
  pipeline,
  type AutomaticSpeechRecognitionOutput,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

const WHISPER_MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-base.en";

let cachedPipeline: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

// Loaded once, on first use, and reused for every subsequent call. Reloading
// model weights per request would add seconds to every tap-to-talk turn —
// confirmed by a pre-build spike on this host: ~1.7s cold model load vs.
// ~1.1s for the transcription itself.
function getPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!cachedPipeline) {
    cachedPipeline = pipeline("automatic-speech-recognition", WHISPER_MODEL);
  }
  return cachedPipeline;
}

/**
 * Transcribes mono PCM audio into text. Expects already-decoded audio (the
 * client decodes via the Web Audio API before sending, since Node has no
 * AudioContext to decode compressed formats like webm/opus itself — see
 * AssistantBubble.tsx's recording code and the transcribe route that calls
 * this).
 */
export async function transcribeAudio(pcm: Float32Array, sampleRate = 16000): Promise<string> {
  const transcriber = await getPipeline();
  const result = (await transcriber(pcm, { sampling_rate: sampleRate })) as
    | AutomaticSpeechRecognitionOutput
    | AutomaticSpeechRecognitionOutput[];
  const text = Array.isArray(result) ? result[0]?.text : result.text;
  return (text ?? "").trim();
}
