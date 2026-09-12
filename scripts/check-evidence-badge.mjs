import { readFileSync } from "node:fs";
import { preferredEvidenceBadge } from "../product.js";

const payload = JSON.parse(readFileSync("data/products.json", "utf8"));
const products = payload.products ?? [];

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

if (!Array.isArray(products) || products.length === 0) {
  fail("products must be a non-empty array");
}

let checked = 0;
for (const product of products) {
  const stored = product.evidenceLevel;
  if (!stored?.value || !stored?.label || !stored?.className) {
    fail(`product ${product.id ?? "<unknown>"} missing complete evidenceLevel`);
    continue;
  }

  const badge = preferredEvidenceBadge(product);
  if (badge.value !== stored.value || badge.label !== stored.label || badge.className !== stored.className) {
    fail(
      `product ${product.id}: preferred badge (${badge.value}/${badge.label}/${badge.className}) ` +
        `does not match evidenceLevel (${stored.value}/${stored.label}/${stored.className})`
    );
    continue;
  }
  checked += 1;
}

if (!process.exitCode) {
  console.log(`Evidence badges match stored evidenceLevel for ${checked} products`);
}
