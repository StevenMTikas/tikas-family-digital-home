// Voice.md: tap-to-talk input, transcribed locally then handed to the
// Assistant exactly as if it were typed. The request body is raw 16kHz mono
// PCM, encoded as little-endian 32-bit floats — AssistantBubble.tsx records
// via MediaRecorder, then decodes and resamples client-side with the Web
// Audio API before sending, since Node has no AudioContext to decode
// compressed audio (webm/opus) itself. Byte order is explicit on both ends
// rather than relying on host-native float layout, the same way created_at
// timestamps are written in one explicit format everywhere rather than
// trusting whatever a given call site defaults to (see the messages route's
// comment on that bug).
//
// Unlike app/api/photos/route.ts and app/api/documents/route.ts, this route
// never calls saveUploadedFile: per Voice.md's "Data Stored" section, voice
// audio itself is never persisted, only the resulting transcript text — the
// buffer is transcribed in memory and discarded.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { isAiEnabledForUser, logAiInteraction } from "@/lib/core/ai";
import { transcribeAudio } from "@/lib/core/ai/whisper";

const SAMPLE_RATE = 16000;

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function decodePcmLE(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer);
  const pcm = new Float32Array(buffer.byteLength / 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getFloat32(i * 4, true);
  return pcm;
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!(await isAiEnabledForUser(actor.id))) {
    return errorResponse("AI_DISABLED", "The Assistant is turned off for your account.", 403);
  }

  const buffer = await req.arrayBuffer().catch(() => null);
  if (!buffer || buffer.byteLength === 0) {
    return errorResponse("INVALID_INPUT", "No audio received.", 400);
  }

  const pcm = decodePcmLE(buffer);

  let text: string;
  try {
    text = await transcribeAudio(pcm, SAMPLE_RATE);
  } catch (err) {
    console.error("[assistant] Failed to transcribe voice input:", err);
    return errorResponse("TRANSCRIPTION_FAILED", "Couldn't transcribe that — try again.", 500);
  }

  await logAiInteraction("assistant", actor.id, {
    transcription: true,
    audioSeconds: Math.round((pcm.length / SAMPLE_RATE) * 10) / 10,
  });

  return NextResponse.json({ text });
}
