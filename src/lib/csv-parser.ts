export interface CsvRow {
  [key: string]: string;
}

export interface ParsedProduct {
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  variants: ParsedVariant[];
  images: ParsedImage[];
  options: { name: string; values: string[] }[];
}

export interface ParsedVariant {
  sku: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity: number;
  optionValues: { optionName: string; name: string }[];
}

export interface ParsedImage {
  src: string;
  position: number;
  altText: string;
}

export interface ValidationResult {
  totalRows: number;
  validProducts: number;
  invalidRows: number;
  warnings: string[];
  errors: string[];
  products: ParsedProduct[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseCsvText(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || "";
    });
    rows.push(row);
  }
  return rows;
}

export function validateAndParse(rows: CsvRow[]): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const productMap = new Map<string, CsvRow[]>();

  rows.forEach((row, idx) => {
    if (!row.Handle) {
      errors.push(`Row ${idx + 2}: Missing Handle`);
      return;
    }
    const existing = productMap.get(row.Handle) || [];
    existing.push(row);
    productMap.set(row.Handle, existing);
  });

  const products: ParsedProduct[] = [];

  for (const [handle, groupRows] of productMap) {
    const primary = groupRows[0];
    if (!primary.Title) {
      errors.push(`Product "${handle}": Missing Title`);
      continue;
    }

    const optionAxes = new Map<string, Set<string>>();
    for (const row of groupRows) {
      for (let i = 1; i <= 3; i++) {
        const name = row[`Option${i} Name`];
        const value = row[`Option${i} Value`];
        if (name && value) {
          if (!optionAxes.has(name)) optionAxes.set(name, new Set());
          optionAxes.get(name)!.add(value);
        }
      }
    }

    const options = Array.from(optionAxes.entries()).map(([name, values]) => ({
      name,
      values: Array.from(values),
    }));
    if (options.length === 0) {
      options.push({ name: "Title", values: ["Default Title"] });
    }

    const variants: ParsedVariant[] = groupRows.map((row) => {
      const optionValues: { optionName: string; name: string }[] = [];
      for (let i = 1; i <= 3; i++) {
        const name = row[`Option${i} Name`];
        const value = row[`Option${i} Value`];
        if (name && value) optionValues.push({ optionName: name, name: value });
      }
      if (optionValues.length === 0) {
        optionValues.push({ optionName: "Title", name: "Default Title" });
      }

      const price = row["Variant Price"] || "0.00";
      if (isNaN(parseFloat(price))) {
        warnings.push(`Product "${handle}": Invalid price "${price}"`);
      }

      return {
        sku: row["Variant SKU"] || "",
        price,
        compareAtPrice: row["Variant Compare At Price"] || undefined,
        inventoryQuantity: parseInt(row["Variant Inventory Qty"] || "0", 10),
        optionValues,
      };
    });

    const images: ParsedImage[] = [];
    for (const row of groupRows) {
      if (row["Image Src"]) {
        images.push({
          src: row["Image Src"],
          position: parseInt(row["Image Position"] || "1", 10),
          altText: row["Image Alt Text"] || "",
        });
      }
    }

    const tags = (primary.Tags || "").split(/[|,]/).map((t) => t.trim()).filter(Boolean);
    const statusRaw = (primary.Status || "active").toLowerCase();
    const status = statusRaw === "draft" ? "DRAFT" : statusRaw === "archived" ? "ARCHIVED" : "ACTIVE";

    products.push({
      handle,
      title: primary.Title,
      descriptionHtml: primary["Body (HTML)"] || "",
      vendor: primary.Vendor || "",
      productType: primary.Type || "",
      tags,
      status,
      variants,
      images,
      options,
    });
  }

  return { totalRows: rows.length, validProducts: products.length, invalidRows: errors.length, warnings, errors, products };
}

export function productToJsonl(product: ParsedProduct, locationId?: string): string {
  return JSON.stringify({
    input: {
      handle: product.handle,
      title: product.title,
      descriptionHtml: product.descriptionHtml,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      status: product.status,
      productOptions: product.options.map((opt) => ({
        name: opt.name,
        values: opt.values.map((v) => ({ name: v })),
      })),
      variants: product.variants.map((v) => {
        const variant: Record<string, unknown> = {
          sku: v.sku,
          price: v.price,
          optionValues: v.optionValues,
        };
        if (v.compareAtPrice) variant.compareAtPrice = v.compareAtPrice;
        if (locationId) {
          variant.inventoryQuantities = [{ locationId, name: "available", quantity: v.inventoryQuantity }];
        }
        return variant;
      }),
    },
  });
}

export function generateJsonlBatch(products: ParsedProduct[], locationId?: string): string {
  return products.map((p) => productToJsonl(p, locationId)).join("\n");
}
