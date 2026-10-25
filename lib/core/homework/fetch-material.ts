// Fetches a Curriculum_Link's material server-side and extracts plain text
// from it, for lib/core/ai/frontier.ts's generateCurriculumPlan() to read.
// See docs/02_Modules/Homeschool.md's "AI-Generated Curriculum Plan" section.
//
// Deliberately not routed through any outside-call approval check itself —
// this is pulling public course/curriculum content *in*, not sending family
// data *out* (the outside-call gate in Security_Architecture.md is about the
// latter). The actual outside call this feature makes is the frontier
// generation request itself, gated where that happens.

import { PDFParse } from "pdf-parse";

// Keeps a single fetched page/PDF from blowing the frontier call's context
// (and cost) — generous enough for a real syllabus, not for an entire
// textbook site scraped in one shot.
const MAX_MATERIAL_CHARS = 40_000;

export async function fetchCurriculumMaterial(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TikasFamilyDigitalHome/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Couldn't fetch ${url} (HTTP ${res.status}).`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await res.arrayBuffer());

  const text =
    contentType.includes("pdf") || url.toLowerCase().split("?")[0]!.endsWith(".pdf")
      ? await extractPdfText(buffer)
      : htmlToText(buffer.toString("utf8"));

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`No readable text found at ${url}.`);
  }
  return trimmed.length > MAX_MATERIAL_CHARS ? trimmed.slice(0, MAX_MATERIAL_CHARS) : trimmed;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

// Deliberately not a full HTML parser (no cheerio/jsdom dependency) — a
// course/syllabus page just needs its readable text pulled out, not a real
// DOM. Strips script/style blocks and tags, then decodes the handful of
// entities actually common in real pages.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}
