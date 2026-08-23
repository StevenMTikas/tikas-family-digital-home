process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

vi.mock("@/lib/core/ai/whisper", () => ({
  transcribeAudio: vi.fn(async () => "remind me to pick up Malachi at five thirty"),
}));

const { transcribeAudio } = await import("@/lib/core/ai/whisper");
const { POST } = await import("./route");

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, ai_enabled)
     VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin', 1)`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, ai_enabled)
     VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', 0)`
  ).run();
});

// Matches route.ts's decodePcmLE — explicit little-endian, not host-native,
// so this test exercises the real wire format the browser will send.
function encodePcmLE(pcm: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(pcm.length * 4);
  const view = new DataView(buffer);
  for (let i = 0; i < pcm.length; i++) view.setFloat32(i * 4, pcm[i] ?? 0, true);
  return buffer;
}

function transcribeReq(userId: string | null, pcm: Float32Array | null) {
  return new NextRequest("http://localhost/api/assistant/transcribe", {
    method: "POST",
    headers: { "x-user-id": userId ?? "" },
    body: pcm ? encodePcmLE(pcm) : undefined,
  });
}

describe("POST /api/assistant/transcribe", () => {
  it("requires authentication", async () => {
    const res = await POST(transcribeReq(null, new Float32Array([0.1, 0.2])));
    expect(res.status).toBe(401);
  });

  it("rejects a user with AI turned off", async () => {
    const res = await POST(transcribeReq("vee", new Float32Array([0.1, 0.2])));
    expect(res.status).toBe(403);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    const res = await POST(transcribeReq("dad", new Float32Array([])));
    expect(res.status).toBe(400);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("transcribes the PCM buffer and returns the text", async () => {
    const pcm = new Float32Array([0.1, -0.2, 0.3]);
    const res = await POST(transcribeReq("dad", pcm));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe("remind me to pick up Malachi at five thirty");
    expect(transcribeAudio).toHaveBeenCalledWith(pcm, 16000);
  });

  it("returns 500 with a clear error if transcription itself throws", async () => {
    vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error("model not loaded"));
    const res = await POST(transcribeReq("dad", new Float32Array([0.1])));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("TRANSCRIPTION_FAILED");
  });
});
