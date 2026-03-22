"use client";

import { useState, useCallback, useRef } from "react";

interface ParsedProduct {
  handle: string;
  title: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  variants: Array<{ sku: string; price: string; inventoryQuantity: number }>;
  images: Array<{ src: string }>;
}

interface ParseResult {
  totalRows: number;
  validProducts: number;
  invalidRows: number;
  warnings: string[];
  errors: string[];
  products: ParsedProduct[];
  jsonl: string;
  jsonlLineCount: number;
}

type Step = "upload" | "preview" | "connect" | "import";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [shopName, setShopName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; operationId?: string; error?: string } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(data);
      setStep("preview");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setParsing(false); }
  }, [file]);

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", shopDomain, accessToken }),
      });
      const data = await res.json();
      if (data.success) { setConnected(true); setShopName(data.shopName || shopDomain); }
      else setError(data.error || "Connection failed");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setConnecting(false); }
  }, [shopDomain, accessToken]);

  const handleImport = useCallback(async () => {
    if (!result?.jsonl) return;
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", shopDomain, accessToken, jsonl: result.jsonl }),
      });
      setImportResult(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setImporting(false); }
  }, [result, shopDomain, accessToken]);

  const downloadJsonl = useCallback(() => {
    if (!result?.jsonl) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([result.jsonl], { type: "application/jsonl" }));
    a.download = "shopify_products.jsonl";
    a.click();
  }, [result]);

  const steps: Step[] = ["upload", "preview", "connect", "import"];

  return (
    <main className="flex-1 flex flex-col font-sans">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium tracking-[-0.02em]">Shopify Bulk Product Importer</h1>
            <p className="text-sm text-zinc-400 mt-0.5">CSV &rarr; Validate &rarr; Preview &rarr; Bulk Import via GraphQL</p>
          </div>
          <span className="font-mono text-xs text-zinc-500 border border-zinc-700 rounded px-2 py-0.5">v1.0</span>
        </div>
      </header>

      <nav className="border-b border-zinc-800 px-6 py-2.5">
        <div className="max-w-5xl mx-auto flex gap-6">
          {steps.map((s, i) => (
            <button key={s} onClick={() => {
              if (s === "upload") setStep(s);
              if (s === "preview" && result) setStep(s);
              if (s === "connect" && result) setStep(s);
              if (s === "import" && result && connected) setStep(s);
            }} className={`text-sm flex items-center gap-2 ${step === s ? "text-white" : "text-zinc-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${step === s ? "bg-white text-black" : "bg-zinc-800 text-zinc-500"}`}>{i + 1}</span>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          {step === "upload" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
                <h2 className="text-lg tracking-tight mb-4">Upload Product CSV</h2>
                <div onClick={() => inputRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".csv")) { setFile(f); setResult(null); } }}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-zinc-700 rounded-lg p-12 text-center cursor-pointer hover:border-zinc-500 transition-colors">
                  <input ref={inputRef} type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setResult(null); setError(""); } }} className="hidden" />
                  {file ? (
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-zinc-500 font-mono mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-zinc-400">Drop a CSV file here or click to browse</p>
                      <p className="text-xs text-zinc-600 mt-1">Supports Matrixify / standard Shopify CSV</p>
                    </div>
                  )}
                </div>
                {file && (
                  <div className="mt-4 flex gap-3">
                    <button onClick={handleParse} disabled={parsing} className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200 disabled:opacity-50">
                      {parsing ? "Parsing..." : "Parse & Validate"}
                    </button>
                    <button onClick={() => { setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = ""; }} className="px-4 py-2 border border-zinc-700 text-sm rounded-md hover:bg-zinc-800">Clear</button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
                <h3 className="text-sm font-medium mb-3">Supported Columns</h3>
                <div className="flex flex-wrap gap-2">
                  {["Handle*", "Title*", "Body (HTML)", "Vendor", "Type", "Tags", "Status", "Option1 Name", "Option1 Value", "Variant SKU", "Variant Price", "Variant Inventory Qty", "Image Src", "Image Alt Text"].map((col) => (
                    <span key={col} className={`font-mono text-xs px-2 py-1 rounded ${col.endsWith("*") ? "bg-white text-black" : "bg-zinc-800 text-zinc-400"}`}>{col}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === "preview" && result && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Total Rows", value: result.totalRows, color: "" },
                  { label: "Valid Products", value: result.validProducts, color: "text-emerald-400" },
                  { label: "Invalid Rows", value: result.invalidRows, color: "text-red-400" },
                  { label: "JSONL Lines", value: result.jsonlLineCount, color: "" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-xs text-zinc-500">{m.label}</p>
                    <p className={`text-2xl font-medium font-mono mt-1 ${m.color}`}>{m.value}</p>
                  </div>
                ))}
              </div>

              {(result.errors.length > 0 || result.warnings.length > 0) && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                  {result.errors.length > 0 && <div><p className="text-sm font-medium text-red-400 mb-1">Errors</p>{result.errors.map((e, i) => <p key={i} className="text-xs text-zinc-500 font-mono">{e}</p>)}</div>}
                  {result.warnings.length > 0 && <div><p className="text-sm font-medium text-yellow-400 mb-1">Warnings</p>{result.warnings.map((w, i) => <p key={i} className="text-xs text-zinc-500 font-mono">{w}</p>)}</div>}
                </div>
              )}

              <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-zinc-800 bg-zinc-800/50">
                    <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Handle</th>
                    <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Title</th>
                    <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Vendor</th>
                    <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Variants</th>
                    <th className="text-right px-4 py-2 text-xs text-zinc-400 font-medium">Images</th>
                    <th className="text-left px-4 py-2 text-xs text-zinc-400 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {result.products.slice(0, 50).map((p) => (
                      <tr key={p.handle} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-2 font-mono text-xs text-zinc-300">{p.handle}</td>
                        <td className="px-4 py-2 text-zinc-200">{p.title}</td>
                        <td className="px-4 py-2 text-zinc-500">{p.vendor}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">{p.variants.length}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">{p.images.length}</td>
                        <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${p.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-700 text-zinc-400"}`}>{p.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.products.length > 50 && <p className="text-xs text-zinc-600 p-4">Showing 50 of {result.products.length}</p>}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="text-sm font-medium mb-2">JSONL Preview</h3>
                <pre className="font-mono text-xs text-zinc-500 overflow-auto max-h-48 whitespace-pre-wrap">
                  {result.jsonl.split("\n").slice(0, 5).join("\n")}
                  {result.jsonlLineCount > 5 && `\n\n... ${result.jsonlLineCount - 5} more lines`}
                </pre>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("connect")} className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200">Connect to Shopify</button>
                <button onClick={downloadJsonl} className="px-4 py-2 border border-zinc-700 text-sm rounded-md hover:bg-zinc-800">Download JSONL</button>
                <button onClick={() => setStep("upload")} className="px-4 py-2 border border-zinc-700 text-sm rounded-md hover:bg-zinc-800">Back</button>
              </div>
            </div>
          )}

          {step === "connect" && (
            <div className="max-w-md space-y-6">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-4">
                <h2 className="text-lg tracking-tight">Connect to Shopify</h2>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Store Domain</label>
                  <input value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} placeholder="your-store.myshopify.com" className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500" />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 block mb-1">Admin API Access Token</label>
                  <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="shpat_..." className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-500" />
                  <p className="text-xs text-zinc-600 mt-1">Requires write_products scope. Never stored server-side.</p>
                </div>
                {connected && <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">Connected to <span className="font-medium">{shopName}</span></div>}
                <div className="border-t border-zinc-800 pt-4 flex gap-3">
                  {!connected ? (
                    <button onClick={handleConnect} disabled={connecting || !shopDomain || !accessToken} className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200 disabled:opacity-50">{connecting ? "Connecting..." : "Verify Connection"}</button>
                  ) : (
                    <button onClick={() => setStep("import")} className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200">Proceed to Import</button>
                  )}
                  <button onClick={() => setStep("preview")} className="px-4 py-2 border border-zinc-700 text-sm rounded-md hover:bg-zinc-800">Back</button>
                </div>
              </div>
            </div>
          )}

          {step === "import" && result && (
            <div className="max-w-md space-y-6">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 space-y-3">
                <h2 className="text-lg tracking-tight mb-2">Import Products</h2>
                <div className="flex justify-between text-sm"><span className="text-zinc-500">Store</span><span className="font-mono">{shopName || shopDomain}</span></div>
                <div className="flex justify-between text-sm"><span className="text-zinc-500">Products</span><span className="font-mono">{result.validProducts}</span></div>
                <div className="flex justify-between text-sm"><span className="text-zinc-500">Total Variants</span><span className="font-mono">{result.products.reduce((a, p) => a + p.variants.length, 0)}</span></div>
                <div className="border-t border-zinc-800 pt-4">
                  {importResult ? (
                    <div className={`p-3 rounded-lg border text-sm ${importResult.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                      {importResult.success ? (
                        <div><p className="font-medium">Bulk operation submitted</p><p className="font-mono text-xs mt-1">ID: {importResult.operationId}</p><p className="text-xs opacity-70 mt-1">Check Shopify admin for progress.</p></div>
                      ) : <p>{importResult.error}</p>}
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <button onClick={handleImport} disabled={importing} className="px-4 py-2 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200 disabled:opacity-50">{importing ? "Submitting..." : "Start Bulk Import"}</button>
                      <button onClick={() => setStep("connect")} className="px-4 py-2 border border-zinc-700 text-sm rounded-md hover:bg-zinc-800">Back</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex justify-between text-xs text-zinc-600">
          <span>Shopify Bulk Product Importer</span>
          <span className="font-mono">GraphQL Bulk Operations API</span>
        </div>
      </footer>
    </main>
  );
}
