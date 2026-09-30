import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const monitorPath = fileURLToPath(new URL("./monitor.mjs", import.meta.url));
const validatorPath = fileURLToPath(new URL("./validate-monitor-data.mjs", import.meta.url));
const sourceUrl = "https://www.vircs.com/products/1";
const offHost = "https://www.nodemach.com/products";
const product = { id: 1, name: "Offline VPS", payable: true, status: "active" };
const productHtml = (data = { data: product, available: 3 }) =>
  `<script data-page="app" type="application/json">${JSON.stringify({ props: { data } })}</script>`;

const mockFetch = `
import { readFileSync, writeFileSync } from "node:fs";
const routes = JSON.parse(readFileSync("routes.json", "utf8"));
const calls = [];
globalThis.fetch = async (input, options, redirects = 0) => {
  const url = String(input);
  calls.push({ url, redirect: options.redirect });
  writeFileSync("calls.json", JSON.stringify(calls));
  const route = routes[url];
  if (!route) throw new Error("Unexpected offline request: " + url);
  if (route.error) throw new Error(route.error);
  const status = route.status ?? 200;
  if (options.redirect === "follow" && [301, 302, 303, 307, 308].includes(status) && route.location) {
    if (redirects === 20) throw new TypeError("fetch failed: too many redirects");
    return globalThis.fetch(new URL(route.location, url).href, options, redirects + 1);
  }
  const response = new Response(route.body ?? "", {
    status,
    headers: route.location ? { location: route.location } : {}
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
};
`;

function runMonitor(routes, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "resnode-vircs-test-"));
  try {
    mkdirSync(join(dir, "monitor"));
    writeFileSync(join(dir, "monitor/sources.json"), JSON.stringify([{
      id: "offline-vircs",
      provider: "VIRCS",
      category: "home",
      adapter: "vircs_inertia_product",
      url: sourceUrl,
      ...overrides
    }]));
    writeFileSync(join(dir, "routes.json"), JSON.stringify(routes));
    writeFileSync(join(dir, "mock-fetch.mjs"), mockFetch);
    execFileSync(process.execPath, ["--import", join(dir, "mock-fetch.mjs"), monitorPath], {
      cwd: dir,
      env: { ...process.env, MONITOR_FETCH_RETRIES: "0", MONITOR_CONCURRENCY: "1" }
    });
    execFileSync(process.execPath, [validatorPath], { cwd: dir });
    return {
      payload: JSON.parse(readFileSync(join(dir, "data/products.json"), "utf8")),
      calls: JSON.parse(readFileSync(join(dir, "calls.json"), "utf8"))
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [label, body] of [
  ["empty product payload", productHtml({ data: {} })],
  ["valid zero stock product", productHtml({ data: product, available: 0 })],
  ["valid positive stock product", productHtml()],
  ["non-Inertia HTML", "Provider landing page"]
]) {
  test(`off-host redirect with ${label} is an error with redirect evidence`, () => {
    const { payload, calls } = runMonitor({
      [sourceUrl]: { status: 302, location: offHost },
      [offHost]: { body }
    });
    const record = payload.products[0];
    assert.deepEqual(calls.map((call) => call.url), [sourceUrl, offHost]);
    assert.equal(record.status, "error");
    assert.equal(record.stockCount, null);
    assert.equal(record.finalUrl, offHost);
    assert.equal(record.httpStatus, 200);
    assert.match(record.evidence, /VIRCS.*redirect/i);
    assert.ok(record.evidence.includes(sourceUrl));
    assert.ok(record.evidence.includes(offHost));
    assert.equal(record.evidenceLevel.value, "error");
    assert.equal(payload.summary.error, 1);
    assert.equal(payload.summary.unavailable, 0);
  });
}

for (const name of [undefined, null, "", " \n\t"]) {
  test(`missing product name (${JSON.stringify(name)}) cannot claim zero stock`, () => {
    const { payload } = runMonitor({ [sourceUrl]: { body: productHtml({ data: { ...product, name }, available: 0 }) } });
    assert.equal(payload.products[0].status, "error");
    assert.equal(payload.products[0].stockCount, null);
    assert.match(payload.products[0].evidence, /product name/i);
  });
}

for (const available of [undefined, null, "", " \n", false, [], {}, "invalid", -1, 1.5]) {
  test(`missing or invalid inventory (${JSON.stringify(available)}) stays unknown`, () => {
    const { payload } = runMonitor({ [sourceUrl]: { body: productHtml({ data: product, available }) } });
    assert.equal(payload.products[0].status, "error");
    assert.equal(payload.products[0].stockCount, null);
    assert.match(payload.products[0].evidence, /available/i);
  });
}

for (const available of [0, 3, "0", "3"]) {
  test(`named same-host product preserves explicit inventory ${JSON.stringify(available)}`, () => {
    const finalUrl = "https://www.vircs.com/products/1?language=en";
    const { payload } = runMonitor({
      [sourceUrl]: { status: 301, location: finalUrl },
      [finalUrl]: { body: productHtml({ data: product, available }) }
    });
    const record = payload.products[0];
    assert.equal(record.name, product.name);
    assert.equal(record.stockCount, Number(available));
    assert.equal(record.status, Number(available) > 0 ? "available" : "unavailable");
    assert.equal(record.finalUrl, finalUrl);
    assert.equal(record.httpStatus, 200);
  });
}

test("VIRCS anti-bot, HTTP, transport and parse failures preserve null inventory", () => {
  for (const [route, status] of [
    [{ body: "Cloudflare Ray ID" }, "blocked"],
    [{ status: 403, body: "cf_chl challenge" }, "blocked"],
    [{ status: 503, body: "Unavailable" }, "error"],
    [{ error: "Offline transport failure" }, "error"],
    [{ body: "Not a product page" }, "error"]
  ]) {
    const { payload } = runMonitor({ [sourceUrl]: route });
    assert.equal(payload.products[0].status, status);
    assert.equal(payload.products[0].stockCount, null);
    assert.ok(payload.products[0].error);
  }
});

test("other providers retain off-host redirects and order-entry parsing", () => {
  const { payload, calls } = runMonitor({
    [sourceUrl]: { status: 302, location: offHost },
    [offHost]: { body: '<div id="products"><div class="card"><h4>Offline VPS</h4><a href="/cart.php?a=add&pid=1">Order</a></div></div>' }
  }, { adapter: "whmcs_group", provider: "Offline provider" });
  assert.equal(calls[0].redirect, "follow");
  assert.equal(payload.products[0].status, "available");
  assert.equal(payload.products[0].finalUrl, offHost);
});
