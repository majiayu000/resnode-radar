import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const monitorPath = fileURLToPath(new URL("./monitor.mjs", import.meta.url));
const validatorPath = fileURLToPath(new URL("./validate-monitor-data.mjs", import.meta.url));
const sourceUrl = "https://www.yin-net.com/index.php?rp=/store/ispip-vps";
const prices = [10, 14, 22, 34];
const cores = [1, 2, 4, 8];
const card = ({ name, price = 10, cpu = "1核", href, stock = "", className = "product" }) => `
  <div class="${className}">
    <h3 class="package-title">${name}</h3>
    <div class="price-amount">$${price}.00 USD</div><div class="price-cycle">月繳</div>
    <ul class="package-features"><li>CPU: ${cpu}</li></ul>
    <p>${stock}</p>${href ? `<a href="${href}">Order</a>` : ""}
  </div>`;

function runMonitor(html, { finalUrl = sourceUrl, ...overrides } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "resnode-lagom-test-"));
  try {
    mkdirSync(join(dir, "monitor"));
    writeFileSync(join(dir, "monitor/sources.json"), JSON.stringify([{
      id: "yinnet-kr-dual-isp", provider: "YINNET", category: "home",
      adapter: "lagom_product_list", url: sourceUrl, ...overrides
    }]));
    writeFileSync(join(dir, "page.html"), html);
    writeFileSync(join(dir, "mock-fetch.mjs"), `
      import { readFileSync } from "node:fs";
      globalThis.fetch = async (url) => {
        if (String(url) !== ${JSON.stringify(overrides.url ?? sourceUrl)}) throw new Error("Unexpected offline request: " + url);
        const response = new Response(readFileSync("page.html", "utf8"));
        Object.defineProperty(response, "url", { value: ${JSON.stringify(finalUrl)} });
        return response;
      };
    `);
    execFileSync(process.execPath, ["--import", join(dir, "mock-fetch.mjs"), monitorPath], {
      cwd: dir, env: { ...process.env, MONITOR_FETCH_RETRIES: "0", MONITOR_CONCURRENCY: "1" }
    });
    execFileSync(process.execPath, [validatorPath], { cwd: dir });
    return JSON.parse(readFileSync(join(dir, "data/products.json"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Names, prices, CPU counts and order routes from the eight YINNET rows in the
// 2026-09-29 checked-in snapshot; HTML reproduces the Lagom product-card shape.
for (const [region, label, group] of [["kr", "韓國", "krisp"], ["jp", "日本", "jpvsp-vps"]]) {
  test(`${region} distinct YINNET SKUs survive an id-keyed consumer`, () => {
    const plans = prices.map((price, index) => ({
      name: `${label}雙ISP| VPS ${["①", "②", "③", "④"][index]}`,
      price, cpu: `${cores[index]}核`, href: `/index.php?rp=/store/${group}/${region}isp${index + 1}`
    }));
    const { products, summary } = runMonitor(plans.map(card).join(""), { id: `yinnet-${region}-dual-isp` });
    const byId = new Map(products.map((product) => [product.id, product]));
    assert.equal(products.length, 4);
    assert.equal(byId.size, 4);
    assert.equal(summary.available, 4);
    plans.forEach((plan, index) => {
      const product = byId.get(`yinnet-${region}-dual-isp:store:${region}isp${index + 1}`);
      assert.ok(product);
      assert.equal(product.name, plan.name);
      assert.equal(product.priceValue, plan.price);
      assert.equal(product.hardware, plan.cpu);
      assert.equal(product.orderUrl, new URL(plan.href, sourceUrl).href);
      assert.equal(product.raw.sourceCardIndex, index);
      assert.equal(product.stockCount, null);
      assert.equal(product.statusLabel, "可订购入口");
      assert.equal(product.evidenceLevel.value, "official-order");
    });
  });
}

test("SKU identities remain stable when cards, names and prices change", () => {
  const plans = [1, 2].map((n) => ({ name: `雙ISP VPS ${n}`, href: `/index.php?rp=/store/krisp/krisp${n}` }));
  const before = runMonitor(plans.map(card).join("")).products;
  const after = runMonitor(plans.toReversed().map((plan) => card({ ...plan, name: "改名套餐", price: 50 })).join("")).products;
  assert.deepEqual(new Map(after.map((p) => [p.orderUrl, p.id])), new Map(before.map((p) => [p.orderUrl, p.id])));
});

test("relative direct store links and encoded rp links extract product paths", () => {
  const finalUrl = "https://www.yin-net.com/store/krisp/";
  const { products } = runMonitor([
    card({ name: "雙ISP VPS", href: "krisp1", className: "package" }),
    card({ name: "雙ISP VPS", href: "/index.php?rp=%2Fstore%2Fkrisp%2Fkrisp2%2F", className: "package" })
  ].join(""), { finalUrl });
  assert.deepEqual(products.map((p) => p.id), ["yinnet-kr-dual-isp:store:krisp1", "yinnet-kr-dual-isp:store:krisp2"]);
  assert.equal(products[0].orderUrl, "https://www.yin-net.com/store/krisp/krisp1");
  assert.ok(products.every((p) => p.finalUrl === finalUrl));
});

test("product path punctuation is retained rather than collapsed by the name slug", () => {
  const { products } = runMonitor(["plan-a", "plan_a"].map((slug) => card({ name: "同名 VPS", href: `/store/krisp/${slug}` })).join(""));
  assert.equal(new Map(products.map((p) => [p.id, p])).size, 2);
  assert.deepEqual(products.map((p) => p.id), ["yinnet-kr-dual-isp:store:plan-a", "yinnet-kr-dual-isp:store:plan_a"]);
});

test("route plan-2 and an unlinked Plan card keep separate identities", () => {
  const { products } = runMonitor([
    card({ name: "Routed plan", href: "/store/group/plan-2" }),
    card({ name: "Plan" })
  ].join(""));
  assert.equal(products.length, 2);
  assert.equal(new Map(products.map((p) => [p.id, p])).size, 2);
});

test("cart pid identities survive reordering, renaming and repricing", () => {
  const plans = [3, 4].map((pid) => ({ name: "中文 VPS", href: `/cart.php?a=add&amp;pid=${pid}` }));
  const before = runMonitor(plans.map(card).join("")).products;
  const reordered = runMonitor(plans.toReversed().map(card).join("")).products;
  const after = runMonitor(plans.toReversed().map((plan) => card({ ...plan, name: "Changed name", price: 50 })).join("")).products;
  assert.equal(new Set(before.map((p) => p.id)).size, 2);
  assert.deepEqual(new Map(reordered.map((p) => [p.orderUrl, p.id])), new Map(before.map((p) => [p.orderUrl, p.id])));
  assert.deepEqual(new Map(after.map((p) => [p.orderUrl, p.id])), new Map(before.map((p) => [p.orderUrl, p.id])));
});

test("unique fallback names keep their name IDs across insertion and reordering", () => {
  const plans = [{ name: "Basic", href: "/contact" }, { name: "Premium" }];
  const before = runMonitor(plans.map(card).join("")).products;
  const after = runMonitor([card({ name: "New plan" }), ...plans.toReversed().map(card)].join("")).products;
  for (const product of before) {
    assert.equal(product.id, `yinnet-kr-dual-isp-${product.name.toLowerCase()}`);
    assert.equal(after.find((p) => p.name === product.name).id, product.id);
  }
});

test("store, pid and fallback names cannot alias each other's identities", () => {
  const plans = [
    { name: "Routed", href: "/store/group/pid-3" },
    { name: "Cart", href: "/cart.php?a=add&amp;pid=3" },
    { name: "pid 3" },
    { name: "store pid 3" },
    { name: "Plan ①" },
    { name: "Plan ②" },
    { name: "Plan 5" },
    { name: "純中文" }
  ];
  const before = runMonitor(plans.map(card).join("")).products;
  const after = runMonitor(plans.toReversed().map(card).join("")).products;
  for (const products of [before, after]) {
    assert.equal(products.length, plans.length);
    assert.equal(new Map(products.map((p) => [p.id, p])).size, plans.length);
  }
  for (const name of ["Routed", "Cart", "pid 3", "store pid 3", "Plan 5"]) {
    assert.equal(after.find((p) => p.name === name).id, before.find((p) => p.name === name).id);
  }
});

test("colliding fallback names and cart links keep distinct IDs and stock evidence", () => {
  const { products } = runMonitor([
    card({ name: "中文 VPS ①", stock: "Sold Out" }),
    card({ name: "中文 VPS ②" }),
    card({ name: "純中文" }),
    card({ name: "純中文" }),
    card({ name: "中文 VPS ③", href: "/cart.php?a=add&amp;pid=3" }),
    card({ name: "中文 VPS ④", href: "/cart.php?a=add&amp;pid=4" })
  ].join(""));
  assert.equal(new Set(products.map((p) => p.id)).size, 6);
  assert.equal(products.find((p) => p.name === "中文 VPS ①").status, "unavailable");
  assert.equal(products.find((p) => p.name === "中文 VPS ①").stockCount, 0);
  assert.equal(products.find((p) => p.name === "中文 VPS ②").status, "unknown");
  assert.equal(products.find((p) => p.name === "中文 VPS ②").stockCount, null);
});

test("missing cards and unpriced cards retain visible parser errors", () => {
  for (const html of ["No product cards", '<div class="product"><h3>Unpriced VPS</h3></div>']) {
    const { products, summary } = runMonitor(html);
    assert.equal(products.length, 1);
    assert.equal(products[0].status, "error");
    assert.equal(products[0].stockCount, null);
    assert.match(products[0].error, /Lagom product cards/);
    assert.equal(summary.error, 1);
  }
});
