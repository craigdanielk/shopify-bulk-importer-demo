import { NextRequest, NextResponse } from "next/server";
import { verifyConnection, getLocations, submitBulkOperation } from "@/lib/shopify-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, shopDomain, accessToken, jsonl } = body;

    if (!shopDomain || !accessToken) return NextResponse.json({ error: "Missing credentials" }, { status: 400 });

    const config = { shopDomain, accessToken };

    if (action === "verify") {
      const result = await verifyConnection(config);
      if (result.success) {
        const locations = await getLocations(config);
        return NextResponse.json({ ...result, locations });
      }
      return NextResponse.json(result);
    }

    if (action === "import") {
      if (!jsonl) return NextResponse.json({ error: "No JSONL data" }, { status: 400 });
      return NextResponse.json(await submitBulkOperation(config, jsonl));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
