import { NextResponse } from "next/server";
import { StudioError } from "@/lib/ai/studio-context";

export function studioFailure(error: unknown) {
  if (error instanceof StudioError) return NextResponse.json({ error: error.message, ...(error.referenceSubject ? { referenceSubject: error.referenceSubject } : {}) }, { status: error.status });
  console.error("studio_operation_failure", { name: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: "The art library is temporarily unavailable." }, { status: 503 });
}
export function studioJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
