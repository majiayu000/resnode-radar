import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, HTMLElement } from "node-html-parser";

// Parse the actual page and execute its modules, with only browser APIs and
// fetch replaced. No requests or monitor jobs run in this rendering test.
function installPage(t) {
  const document = parse(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  document.documentElement = document.querySelector("html");
  const handlers = new WeakMap();
  const styles = new WeakMap();
  const frames = new Map();
  const intervals = new Map();
  let nextFrame = 0;
  const globals = {
    document,
    window: { location: { href: "https://example.invalid/" }, addEventListener() {} },
    HTMLSelectElement: class { static [Symbol.hasInstance](node) { return node.tagName === "SELECT"; } },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    setInterval(callback, delay) { intervals.set(delay, callback); }
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
  for (const [name, descriptor] of Object.entries({
    dataset: { get() { return Object.fromEntries(Object.entries(this.attributes).filter(([key]) => key.startsWith("data-")).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()), value])); } },
    style: { get() { if (!styles.has(this)) styles.set(this, {}); return styles.get(this); } },
    addEventListener: { value(event, handler) { if (!handlers.has(this)) handlers.set(this, {}); handlers.get(this)[event] = handler; } }
  })) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, ...descriptor });
    t.after(() => delete HTMLElement.prototype[name]);
  }
  const tokenList = Object.getPrototypeOf(document.documentElement.classList);
  t.mock.method(tokenList, "toggle", function (name, force = !this.contains(name)) {
    if (force) this.add(name); else this.remove(name);
    return force;
  });
  return {
    document,
    text: (selector) => document.querySelector(selector).textContent.trim(),
    click(selector) { const node = document.querySelector(selector); handlers.get(node).click({ target: node }); },
    tick(delay) { intervals.get(delay)(); },
    finishAnimations() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(performance.now() + 1000));
    }
  };
}

const payload = {
  generatedAt: "2026-10-08T12:00:00Z", sourceCount: 1,
  summary: { total: 1, available: 1, unavailable: 0, blocked: 0, error: 0 },
  products: [{ id: "synthetic", sourceId: "test", provider: "Synthetic only", name: "Synthetic product", status: "available", stockCount: 3, orderUrl: "https://example.invalid/order" }]
};

function assertUnavailable(page) {
  assert.equal(page.text("[data-monitor-status]"), "本站数据加载失败");
  assert.ok(page.document.querySelector("[data-monitor-status]").classList.contains("has-warning"));
  assert.equal(page.text("[data-trust-state]"), "本站监控数据不可用");
  assert.equal(page.text("[data-trust-freshness]"), "当前库存未知");
  assert.equal(page.text("[data-monitor-summary]"), "监控数据不可用");
  assert.equal(page.text("[data-evidence-summary]"), "-");
  for (const selector of ["[data-products]", "[data-mobile-products]"]) {
    assert.match(page.text(selector), /本站监控数据加载失败/);
    assert.doesNotMatch(page.text(selector), /Synthetic product/);
  }
  for (const selector of ["[data-stat-total]", "[data-stat-available]", "[data-stat-unavailable]", "[data-stat-sources]", "[data-ring-pct]", "[data-trust-age]", "[data-sync]"]) {
    assert.equal(page.text(selector), "-", selector);
  }
  assert.equal(page.text("[data-result-count]"), "显示 0 / 0 条");
}

test("site data loading, errors, and repeated refreshes stay consistent", async (t) => {
  const page = installPage(t);
  let now = Date.parse(payload.generatedAt);
  t.mock.method(Date, "now", () => now);
  const requests = [];
  t.mock.method(globalThis, "fetch", (url, options) => {
    assert.match(url, /^data\/products\.json\?t=\d+$/);
    assert.equal(options.cache, "no-store");
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  });
  const settle = async (kind, responsePayload = payload) => {
    const request = requests.shift();
    assert.ok(request);
    if (kind === "network") request.reject(new TypeError("Failed to fetch"));
    else if (kind === "http") request.resolve(new Response("Unavailable", { status: 503 }));
    else if (kind === "json") request.resolve(new Response("{invalid"));
    else request.resolve(new Response(JSON.stringify(responsePayload)));
    await new Promise(setImmediate);
  };
  const assertLoading = () => {
    assert.equal(page.text("[data-monitor-status]"), "加载监控数据中");
    assert.equal(page.text("[data-trust-freshness]"), "加载中");
    assert.match(page.text("[data-mobile-products]"), /加载监控数据中/);
    assert.ok(!page.document.querySelector("[data-monitor-status]").classList.contains("has-warning"));
    assert.ok(page.document.querySelector(".skel-row"));
  };
  const assertSuccess = () => {
    page.finishAnimations();
    assert.equal(page.text("[data-monitor-status]"), "监控快照已加载");
    assert.ok(!page.document.querySelector("[data-monitor-status]").classList.contains("has-warning"));
    assert.equal(page.text("[data-stat-total]"), "1");
    assert.equal(page.text("[data-stat-unavailable]"), "0");
    assert.match(page.text("[data-products]"), /Synthetic product/);
    assert.match(page.text("[data-mobile-products]"), /Synthetic product/);
  };
  await import("../app.js");
  await t.test("initial pending request shows loading", assertLoading);
  for (const kind of ["network", "json"]) {
    await settle(kind);
    await t.test(`${kind} failure is site data unavailable, not zero inventory`, () => assertUnavailable(page));
    page.click("[data-filter-reset]");
    await t.test(`${kind} failure survives filter reset`, () => assertUnavailable(page));
    page.click("[data-refresh]");
    await t.test(`retry after ${kind} failure shows loading`, assertLoading);
  }
  await settle("success");
  await t.test("success recovers product rows and summaries", assertSuccess);
  page.click("[data-refresh]");
  await t.test("pending refresh retains the previous summary", () => assert.equal(page.text("[data-stat-total]"), "1"));
  await settle("http");
  await t.test("HTTP failure clears previously loaded data", () => {
    assertUnavailable(page);
    assert.match(page.text("[data-products]"), /HTTP 503/);
  });
  page.click("[data-refresh]");
  await settle("success");
  page.click("[data-refresh]");
  await settle("network");
  page.finishAnimations();
  await t.test("rapid failure cannot restore counts from an earlier success animation", () => assertUnavailable(page));
  page.click("[data-refresh]");
  await settle("success");
  await t.test("a later success clears the error and warning", assertSuccess);

  await t.test("the displayed snapshot ages without a reload and expires at two hours", () => {
    now += 119 * 60_000;
    page.tick(60_000);
    assert.equal(page.text("[data-trust-age]"), "1 小时前");
    assert.equal(page.text("[data-trust-freshness]"), "已发布快照");
    now += 60_000;
    page.tick(60_000);
    assert.equal(page.text("[data-trust-age]"), "2 小时前");
    assert.equal(page.text("[data-trust-freshness]"), "快照已过期");
    assert.equal(page.text("[data-monitor-status]"), "快照已过期");
    assert.ok(page.document.querySelector("[data-monitor-status]").classList.contains("has-warning"));
    assert.match(page.text("[data-products]"), /Synthetic product/);
    assert.equal(requests.length, 0);
  });

  await t.test("unknown or future timestamps never appear current", async () => {
    for (const invalid of [undefined, "invalid", new Date(now + 60_000).toISOString()]) {
      page.click("[data-refresh]");
      await settle("success", { ...payload, generatedAt: invalid });
      assert.equal(page.text("[data-trust-age]"), "未知");
      assert.equal(page.text("[data-sync]"), "-");
      assert.equal(page.text("[data-monitor-status]"), "快照时间未知");
      assert.ok(page.document.querySelector("[data-monitor-status]").classList.contains("has-warning"));
      assert.match(page.text("[data-products]"), /Synthetic product/);
    }
  });

  await t.test("fresh data separates order entries, precise stock, snapshots, and source errors", async () => {
    const product = payload.products[0];
    const products = [product,
      { ...product, id: "order-only", stockCount: null },
      { ...product, id: "snapshot", evidenceLevel: { value: "snapshot", label: "第三方快照", className: "is-snapshot" } },
      { ...product, id: "failed", status: "error", stockCount: null, orderUrl: null }
    ];
    page.click("[data-refresh]");
    await settle("success", {
      ...payload,
      generatedAt: new Date(now).toISOString(),
      summary: { ...payload.summary, total: 4, available: 3, error: 1 },
      products
    });
    assert.equal(page.text("[data-monitor-status]"), "监控有异常源");
    assert.equal(page.text("[data-monitor-summary]"), "直连受阻 0 条 · 抓取失败 1 条");
    assert.equal(page.text("[data-evidence-summary]"), "精确库存 1 条 · 官方订购入口 1 条 · 第三方快照 1 条 · 待核验 0 条");
    assert.equal(page.text("[data-trust-age]"), "刚刚更新");
    assert.equal(page.text("[data-trust-freshness]"), "已发布快照");
    const rowBadges = [...page.document.querySelectorAll("[data-products] .chip-evidence")].map((node) => node.textContent.trim());
    assert.deepEqual(rowBadges.sort(), ["官方订购入口", "抓取失败", "精确库存 3", "第三方快照"].sort());
  });
  assert.equal(requests.length, 0);
});
