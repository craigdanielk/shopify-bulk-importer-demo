import { NextRequest, NextResponse } from "next/server";
import { parseCsvText, validateAndParse, generateJsonlBatch } from "@/lib/csv-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const locationId = formData.get("locationId") as string | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const text = await file.text();
    const rows = parseCsvText(text);
    if (rows.length === 0) return NextResponse.json({ error: "CSV is empty or malformed" }, { status: 400 });

    const result = validateAndParse(rows);
    const jsonl = generateJsonlBatch(result.products, locationId || undefined);

    return NextResponse.json({ ...result, jsonl, jsonlLineCount: result.products.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Parse failed" }, { status: 500 });
  }
}
