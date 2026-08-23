import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTranscriber = vi.fn();
const mockPipeline = vi.fn(async () => mockTranscriber);

vi.mock("@huggingface/transformers", () => ({
  pipeline: mockPipeline,
}));

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.resetModules();
    mockPipeline.mockClear();
    mockTranscriber.mockReset();
  });

  it("passes the PCM buffer and sample rate straight through to the pipeline", async () => {
    mockTranscriber.mockResolvedValue({ text: "hello there" });
    const { transcribeAudio } = await import("./whisper");
    const pcm = new Float32Array([0.1, 0.2, 0.3]);

    const text = await transcribeAudio(pcm, 16000);

    expect(text).toBe("hello there");
    expect(mockTranscriber).toHaveBeenCalledWith(pcm, { sampling_rate: 16000 });
  });

  it("trims whitespace off the returned transcript", async () => {
    mockTranscriber.mockResolvedValue({ text: "  padded out  " });
    const { transcribeAudio } = await import("./whisper");

    const text = await transcribeAudio(new Float32Array([0]));

    expect(text).toBe("padded out");
  });

  it("handles an array-shaped pipeline result, taking the first entry", async () => {
    mockTranscriber.mockResolvedValue([{ text: "first chunk" }, { text: "second chunk" }]);
    const { transcribeAudio } = await import("./whisper");

    const text = await transcribeAudio(new Float32Array([0]));

    expect(text).toBe("first chunk");
  });

  it("loads the model pipeline only once across multiple transcription calls", async () => {
    mockTranscriber.mockResolvedValue({ text: "ok" });
    const { transcribeAudio } = await import("./whisper");

    await transcribeAudio(new Float32Array([0]));
    await transcribeAudio(new Float32Array([0]));
    await transcribeAudio(new Float32Array([0]));

    // The whole point of the module-level singleton (see whisper.ts's
    // getPipeline) is avoiding a multi-second model reload on every
    // tap-to-talk request — this guards against that regressing silently.
    expect(mockPipeline).toHaveBeenCalledTimes(1);
    expect(mockTranscriber).toHaveBeenCalledTimes(3);
  });

  it("defaults to a blank string when the pipeline returns no text", async () => {
    mockTranscriber.mockResolvedValue({ text: undefined });
    const { transcribeAudio } = await import("./whisper");

    const text = await transcribeAudio(new Float32Array([0]));

    expect(text).toBe("");
  });
});
