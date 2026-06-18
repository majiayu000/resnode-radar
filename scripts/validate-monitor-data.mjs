import { readFileSync } from "node:fs";

const payload = JSON.parse(readFileSync("data/products.json", "utf8"));
const validStatuses = new Set(["available", "unavailable", "unknown", "blocked", "error"]);
const validEvidenceLevels = new Set(["error", "unavailable", "stock-count", "snapshot", "blocked", "official-order", "unverified"]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (payload.schemaVersion !== 1) fail("schemaVersion must be 1");
if (!payload.generatedAt || Number.isNaN(Date.parse(payload.generatedAt))) fail("generatedAt must be an ISO date");
if (!Array.isArray(payload.products)) fail("products must be an array");
if (!payload.products?.length) fail("products must not be empty");

for (const product of payload.products ?? []) {
  for (const field of ["id", "sourceId", "provider", "category", "adapter", "sourceUrl", "fetchedAt", "status", "statusLabel", "evidence"]) {
    if (product[field] === undefined || product[field] === null || product[field] === "") fail(`product ${product.id ?? "<unknown>"} missing ${field}`);
  }
  if (!validStatuses.has(product.status)) fail(`product ${product.id} has invalid status ${product.status}`);
  if (product.status === "available" && !product.orderUrl) fail(`available product ${product.id} must include orderUrl`);
  if (!product.evidenceLevel || typeof product.evidenceLevel !== "object") fail(`product ${product.id} missing evidenceLevel`);
  if (product.evidenceLevel && !validEvidenceLevels.has(product.evidenceLevel.value)) {
    fail(`product ${product.id} has invalid evidenceLevel ${product.evidenceLevel.value}`);
  }
  if (!product.evidenceLevel?.label) fail(`product ${product.id} missing evidenceLevel.label`);
  if (!product.evidenceLevel?.className) fail(`product ${product.id} missing evidenceLevel.className`);
  if (!Array.isArray(product.riskTags)) fail(`product ${product.id} riskTags must be an array`);
  if (Array.isArray(product.riskTags) && product.riskTags.length === 0) fail(`product ${product.id} riskTags must not be empty`);
  for (const tag of product.riskTags ?? []) {
    if (!tag?.value || !tag?.label || !tag?.severity) fail(`product ${product.id} has invalid risk tag`);
  }
  if (product.status !== "available" && product.status !== "unavailable" && !product.error && !product.evidence) {
    fail(`non-available product ${product.id} must include evidence or error`);
  }
}

if (!process.exitCode) console.log(`Validated ${payload.products.length} monitor records`);
