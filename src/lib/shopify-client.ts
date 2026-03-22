const API_VERSION = "2024-10";

interface ShopifyConfig {
  shopDomain: string;
  accessToken: string;
}

async function gql(config: ShopifyConfig, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(`https://${config.shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": config.accessToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function verifyConnection(config: ShopifyConfig) {
  try {
    const r = await gql(config, `{ shop { name myshopifyDomain plan { displayName } } }`);
    if (r.errors) return { success: false, error: r.errors[0].message };
    return { success: true, shopName: r.data?.shop?.name };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function getLocations(config: ShopifyConfig) {
  const r = await gql(config, `{ locations(first: 10) { nodes { id name isActive } } }`);
  return r.data?.locations?.nodes || [];
}

export async function submitBulkOperation(config: ShopifyConfig, jsonl: string) {
  // Step 1: staged upload
  const stage = await gql(config, `mutation {
    stagedUploadsCreate(input: [{ resource: BULK_MUTATION_VARIABLES, filename: "products.jsonl", mimeType: "text/jsonl", httpMethod: POST }]) {
      stagedTargets { url resourceUrl parameters { name value } }
      userErrors { field message }
    }
  }`);

  const target = stage.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) return { success: false, error: "No staged upload target" };

  // Step 2: upload
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([jsonl], { type: "text/jsonl" }));
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) return { success: false, error: `Upload failed: ${upload.status}` };

  // Step 3: start bulk mutation
  const bulk = await gql(config, `mutation {
    bulkOperationRunMutation(
      mutation: "mutation($input: ProductInput!) { productCreate(input: $input) { product { id } userErrors { field message } } }"
      stagedUploadPath: "${target.resourceUrl}"
    ) { bulkOperation { id status } userErrors { field message } }
  }`);

  const op = bulk.data?.bulkOperationRunMutation;
  if (op?.userErrors?.length) return { success: false, error: op.userErrors[0].message };
  return { success: true, operationId: op?.bulkOperation?.id };
}
