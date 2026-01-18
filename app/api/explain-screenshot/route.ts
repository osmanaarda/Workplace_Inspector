import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type AnalysisMode = "kitchen" | "warehouse" | "office";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const mode = ((formData.get("mode") as string) || "kitchen") as AnalysisMode;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Validate file size (10MB)
    if (image.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an image." },
        { status: 400 }
      );
    }

    // Convert image to data URL
    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${image.type};base64,${base64}`;

    const prompt = getPromptForMode(mode);

    // ✅ Use Responses API (current)
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
      max_output_tokens: 900,
    } as any);

    const content = (resp as any)?.output_text?.trim?.() ? (resp as any).output_text : "";

    // If model returns empty output, respond gracefully
    if (!content.trim()) {
      return NextResponse.json(
        {
          whatISee: "",
          whatThisMeans: "",
          possibleIssues: "",
          whatYouCanDoNext: "",
          riskLevel: "LOW",
          raw: "",
          error: "Empty model output. Check billing/credits or try another image.",
        },
        { status: 200 }
      );
    }

    const sections = {
      whatISee: extract("WHAT_I_SEE", content),
      whatThisMeans: extract("WHAT_THIS_MEANS", content),
      possibleIssues: extract("POSSIBLE_ISSUES", content),
      whatYouCanDoNext: extract("WHAT_YOU_CAN_DO_NEXT", content),
      riskLevel: normalizeRisk(extract("RISK_LEVEL", content)),
      raw: content,
      result: content, // (optional) UI fallback
    };

    return NextResponse.json(sections);
  } catch (error: any) {
    // Better error messages
    const status = error?.status || 500;
    const msg =
      error?.message ||
      (status === 429
        ? "API quota exceeded. Check OpenAI billing/credits."
        : "Failed to analyze screenshot");

    console.error("VISION ERROR:", error);
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * ✅ Strong marker-based extraction:
 * Looks for:
 * [TAG]
 * ...content...
 * until next [OTHER_TAG] or end.
 */
function extract(tag: string, text: string): string {
  const r = new RegExp(
    `\\[${escapeRegex(tag)}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[[A-Z0-9_]+\\]|$)`,
    "i"
  );
  const m = text.match(r);
  return m ? m[1].trim() : "";
}

function normalizeRisk(raw: string): "LOW" | "MEDIUM" | "HIGH" {
  const s = (raw || "").toUpperCase();
  if (s.includes("HIGH")) return "HIGH";
  if (s.includes("MEDIUM")) return "MEDIUM";
  return "LOW";
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ✅ Prompt includes a "workplace gate" so t-shirt/ads don't get kitchen analysis.
 * Also enforces:
 * - No markdown
 * - Strict markers
 * - No placeholders/instructions in output
 */
function getPromptForMode(mode: AnalysisMode) {
  if (mode === "warehouse") {
    return `
You are an AI workplace safety inspector for warehouses and storage areas.

CRITICAL RULE (WORKPLACE GATE):
If the image is NOT a real warehouse/storage/industrial workplace (e.g., it is a product photo, clothing ad, selfie, random object),
then respond with EXACTLY this and stop:

[WHAT_I_SEE]
This image does not appear to show a warehouse or storage workplace.

[WHAT_THIS_MEANS]
Warehouse/storage safety analysis is not applicable for this image.

[POSSIBLE_ISSUES]
- Not applicable.

[WHAT_YOU_CAN_DO_NEXT]
1) Upload a real photo of a warehouse, storage room, loading area, or industrial workspace.
2) Ensure storage, walkways, exits, or equipment are visible.

[RISK_LEVEL]
LOW - no workplace hazards can be assessed from this image.

--- END ---

If it IS a warehouse/storage workplace, respond using EXACT markers below.
Do NOT use markdown (no **bold**, no ###). Do NOT include instructions or placeholders.

Return in this exact format:

[WHAT_I_SEE]
Objective description only.

[WHAT_THIS_MEANS]
Operational context of what is shown.

[POSSIBLE_ISSUES]
Use "-" bullets. Focus on: unsafe stacking, blocked exits, trip hazards, spills/leaks, labeling/signage, equipment safety, pests if relevant, temperature control if relevant.

[WHAT_YOU_CAN_DO_NEXT]
Steps as 1) 2) 3)

[RISK_LEVEL]
LOW / MEDIUM / HIGH - short reason.

Be conservative. If unsure, say so.
`.trim();
  }

  if (mode === "office") {
    return `
You are an AI workplace safety assistant for office environments.

CRITICAL RULE (WORKPLACE GATE):
If the image is NOT a real office/workplace scene (e.g., it is a product photo, clothing ad, selfie),
then respond with EXACTLY this and stop:

[WHAT_I_SEE]
This image does not appear to show an office workplace.

[WHAT_THIS_MEANS]
Office safety/ergonomic analysis is not applicable for this image.

[POSSIBLE_ISSUES]
- Not applicable.

[WHAT_YOU_CAN_DO_NEXT]
1) Upload a real photo of an office area (desk, walkway, cables, equipment).
2) Ensure the work setup is visible.

[RISK_LEVEL]
LOW - no office hazards can be assessed from this image.

--- END ---

If it IS an office scene, respond using EXACT markers below.
Do NOT use markdown (no **bold**, no ###). Do NOT include instructions or placeholders.

Return in this exact format:

[WHAT_I_SEE]
Objective description only.

[WHAT_THIS_MEANS]
Explain the office context.

[POSSIBLE_ISSUES]
Use "-" bullets. Focus on: cable trip hazards, ergonomics, blocked walkways/exits, electrical overload, fire safety, clutter, lighting.

[WHAT_YOU_CAN_DO_NEXT]
Steps as 1) 2) 3)

[RISK_LEVEL]
LOW / MEDIUM / HIGH - short reason.

Be conservative. If unsure, say so.
`.trim();
  }

  // ✅ kitchen (default)
  return `
You are an AI kitchen & food-safety inspector (HACCP mindset).

CRITICAL RULE (WORKPLACE GATE):
If the image is NOT a real kitchen/food prep area/cold room/food storage room (e.g., it is a clothing ad, product photo, selfie),
then respond with EXACTLY this and stop:

[WHAT_I_SEE]
This image does not appear to show a kitchen or food-related workplace.

[WHAT_THIS_MEANS]
Food safety analysis is not applicable for this image.

[POSSIBLE_ISSUES]
- Not applicable.

[WHAT_YOU_CAN_DO_NEXT]
1) Upload a real photo from a kitchen, prep area, cold room, or food storage area.
2) Make sure surfaces, containers, food items, or equipment are visible.

[RISK_LEVEL]
LOW - no food-safety risks can be assessed from this image.

--- END ---

If it IS a food-related workplace, respond using EXACT markers below.
Do NOT use markdown (no **bold**, no ###). Do NOT include instructions or placeholders.

Return in this exact format:

[WHAT_I_SEE]
Describe only what is visible (food items, surfaces, equipment, storage, containers, floor condition, cleanliness).

[WHAT_THIS_MEANS]
Explain what type of area this likely is (prep, storage, cold room, dishwashing, etc.) and why.

[POSSIBLE_ISSUES]
Use "-" bullets. Focus on:
- cross-contamination risks
- uncovered food/open containers
- labeling/dating absence
- spills/residue/dirty surfaces
- improper storage (on floor, near chemicals, etc.)
- pest risk indicators
- temperature control risk ONLY if a cooling/storage unit is visible or implied

[WHAT_YOU_CAN_DO_NEXT]
Give practical steps starting with 1) 2) 3)

[RISK_LEVEL]
LOW / MEDIUM / HIGH - short reason.

Be conservative. If unsure, say so.
`.trim();
}
