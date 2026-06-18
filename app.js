let payload = null;
let products = [];
let activeCategory = "home";
let activeSort = "stock";
const selected = new Set();

const filters = {
  search: "",
  region: "all",
  provider: "all",
  ipType: "all",
  status: "all",
  price: "all"
};

const categoryNames = {
  all: "全部产品",
  home: "监控产品",
  premium: "顶级线路",
  cheap: "便宜 VPS"
};

const statusLabels = {
  available: "可订购",
  unavailable: "不可订购",
  unknown: "未知",
  blocked: "被阻断",
  error: "抓取失败"
};

const ipTypeOrder = ["home", "dual-isp", "residential", "native", "pending"];

const priceBands = [
  { value: "under-5", label: "≤ 5", test: (price) => Number.isFinite(price) && price <= 5 },
  { value: "5-10", label: "5-10", test: (price) => Number.isFinite(price) && price > 5 && price <= 10 },
  { value: "10-20", label: "10-20", test: (price) => Number.isFinite(price) && price > 10 && price <= 20 },
  { value: "20-50", label: "20-50", test: (price) => Number.isFinite(price) && price > 20 && price <= 50 },
  { value: "50-plus", label: "> 50", test: (price) => Number.isFinite(price) && price > 50 },
  { value: "unknown", label: "未标价", test: (price) => !Number.isFinite(price) }
];

function formatClock(date) {
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("zh-CN")} ${formatClock(date)}`;
}

function text(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function escapeHtml(value) {
  return text(value, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value) {
  const href = text(value, "");
  if (!href) return "#";
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return "#";
  }
  return "#";
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function setHidden(selector, hidden) {
  document.querySelectorAll(selector).forEach((node) => {
    node.hidden = hidden;
  });
}

function statusClass(status) {
  return `is-${statusLabels[status] ? status : "unknown"}`;
}

function statusRank(status) {
  if (status === "available") return 1;
  if (status === "unavailable") return 2;
  if (status === "unknown") return 3;
  if (status === "blocked") return 4;
  return 5;
}

function normalizeSearch(value) {
  return text(value, "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function searchableText(product) {
  return normalizeSearch([product.provider, product.name, product.region, product.route, product.note, product.evidence].filter(Boolean).join(" "));
}

function stableProductKey(product, index) {
  return [
    product.id,
    product.sourceId,
    product.provider,
    product.name,
    product.region,
    product.route,
    product.price,
    product.orderUrl || product.sourceUrl,
    index
  ]
    .map((part) => encodeURIComponent(text(part, "")))
    .join("|");
}

function inferIpType(product) {
  const value = [
    product.provider,
    product.name,
    product.region,
    product.route,
    product.note,
    product.hardware,
    product.bandwidth,
    product.evidence
  ]
    .filter(Boolean)
    .join(" ");

  if (/真家宽|家庭宽带|家里云|真实家宽|真实住宅|本地住宅ISP家寬|home broadband/i.test(value)) {
    return { value: "home", label: "真家宽", className: "is-home" };
  }
  if (/双\s*ISP|雙\s*ISP|\bdual[-\s]?isp\b/i.test(value)) {
    return { value: "dual-isp", label: "双ISP", className: "is-isp" };
  }
  if (/住宅|家宽|家寬|residential|AT&T|Frontier|T-Mobile|HiNet|HKT|HGC|HKBN|iCable|SoftBank|KDDI|Biglobe|Atlas Networks/i.test(value)) {
    return { value: "residential", label: "住宅IP", className: "is-residential" };
  }
  if (/原生\s*IP|native/i.test(value)) {
    return { value: "native", label: "原生IP", className: "is-native" };
  }
  return { value: "pending", label: "待核验", className: "is-pending" };
}

function evidenceText(product) {
  return normalizeSearch(
    [
      product.evidence,
      product.status,
      product.statusLabel,
      product.note,
      product.raw?.strategy,
      product.raw?.stockLabel,
      product.raw?.official?.outcome
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function numericStockCount(product) {
  if (product.stockCount === undefined || product.stockCount === null || product.stockCount === "") return null;
  const value = Number(product.stockCount);
  return Number.isFinite(value) ? value : null;
}

function evidenceBadge(product) {
  if (product.evidenceLevel?.value && product.evidenceLevel?.label && product.evidenceLevel?.className) {
    return product.evidenceLevel;
  }
  const evidence = evidenceText(product);
  const stockCount = numericStockCount(product);
  const hasPreciseStock = stockCount !== null;
  const isSnapshot = /reader_snapshot|third-party|snapshot|快照/i.test(evidence);

  if (product.status === "error" || /\berror\b|抓取失败|fetch failed|timeout/i.test(evidence)) {
    return { value: "error", label: "抓取失败", className: "is-error" };
  }
  if (product.status === "unavailable" || stockCount === 0) {
    return { value: "unavailable", label: "不可订购", className: "is-unavailable" };
  }
  if (hasPreciseStock) {
    return { value: "stock-count", label: `精确库存 ${stockCount}`, className: "is-count" };
  }
  if (isSnapshot) {
    return { value: "snapshot", label: "第三方快照", className: "is-snapshot" };
  }
  if (product.status === "blocked" || /blocked|被阻断|403|429|official direct fetch blocked/i.test(evidence)) {
    return { value: "blocked", label: "直连受阻", className: "is-blocked" };
  }
  if (product.orderUrl || /order link found|order=yes|official page|product card parsed from official page|立即订购|product-wrap order link/i.test(evidence)) {
    return { value: "official-order", label: "官方订购入口", className: "is-official" };
  }
  return { value: "unverified", label: "证据待核验", className: "is-unknown" };
}

function normalizedRiskTags(product) {
  if (Array.isArray(product.riskTags) && product.riskTags.length > 0) {
    return product.riskTags.filter((tag) => tag?.value && tag?.label);
  }
  return [{ value: "unknown", label: "风险待核验", severity: "medium" }];
}

function orderabilityRank(product) {
  const stockCount = numericStockCount(product);
  const hasOrderUrl = Boolean(product.orderUrl);
  if (product.status === "available" && stockCount !== null && stockCount > 0) return 1;
  if (product.status === "available" && hasOrderUrl) return 2;
  if (product.status === "available") return 3;
  if (product.status === "unavailable") return 4;
  if (product.status === "unknown") return 5;
  if (product.status === "blocked") return 6;
  return 7;
}

function stableCompare(a, b) {
  return a._stableKey.localeCompare(b._stableKey, "zh-CN");
}

function normalizeProduct(product, index) {
  const ipType = inferIpType(product);
  const normalized = {
    ...product,
    _index: index,
    _stableKey: stableProductKey(product, index),
    _ipType: ipType,
    _searchText: searchableText(product)
  };
  normalized._evidenceBadge = evidenceBadge(normalized);
  normalized._riskTags = normalizedRiskTags(normalized);
  return normalized;
}

function priceBandFor(product) {
  return priceBands.find((band) => band.test(Number(product.priceValue)))?.value ?? "unknown";
}

function filterBaseProducts() {
  return activeCategory === "all" ? products : products.filter((product) => product.category === activeCategory);
}

function matchesFilters(product) {
  const query = normalizeSearch(filters.search).trim();
  if (query && !query.split(/\s+/).every((part) => product._searchText.includes(part))) return false;
  if (filters.region !== "all" && product.region !== filters.region) return false;
  if (filters.provider !== "all" && product.provider !== filters.provider) return false;
  if (filters.ipType !== "all" && product._ipType.value !== filters.ipType) return false;
  if (filters.status !== "all" && product.status !== filters.status) return false;
  if (filters.price !== "all" && priceBandFor(product) !== filters.price) return false;
  return true;
}

function filteredProducts() {
  return filterBaseProducts().filter(matchesFilters);
}

function visibleProducts() {
  const list = filteredProducts();
  return [...list].sort((a, b) => {
    if (activeSort === "price") {
      return (a.priceValue ?? 999999) - (b.priceValue ?? 999999) || orderabilityRank(a) - orderabilityRank(b) || stableCompare(a, b);
    }
    if (activeSort === "stock") {
      return orderabilityRank(a) - orderabilityRank(b) || (b.stockCount ?? -1) - (a.stockCount ?? -1) || stableCompare(a, b);
    }
    if (activeSort === "updated") {
      return text(b.fetchedAt, "").localeCompare(text(a.fetchedAt, "")) || stableCompare(a, b);
    }
    return orderabilityRank(a) - orderabilityRank(b) || (a.priceValue ?? 999999) - (b.priceValue ?? 999999) || stableCompare(a, b);
  });
}

function formatRelativeAge(value) {
  if (!value) return "未知";
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "未知";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "刚刚更新";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "刚刚更新";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function refreshClock() {
  setText("[data-now]", formatClock(new Date()));
}

function renderCounts() {
  const counts = {
    all: products.length,
    home: products.filter((product) => product.category === "home").length,
    premium: products.filter((product) => product.category === "premium").length,
    cheap: products.filter((product) => product.category === "cheap").length
  };

  for (const [category, count] of Object.entries(counts)) {
    setText(`[data-count-${category}]`, count);
    if (category !== "all") setHidden(`[data-category="${category}"]`, count === 0);
  }

  if (activeCategory !== "all" && counts[activeCategory] === 0) {
    activeCategory = counts.home > 0 ? "home" : "all";
  }
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.category === activeCategory);
  });
}

function renderSummary() {
  setText("[data-sync]", payload ? formatDateTime(payload.generatedAt) : "-");
  setText(
    "[data-monitor-summary]",
    payload
      ? `来源 ${payload.sourceCount} 个，记录 ${payload.summary.total} 条，可订购 ${payload.summary.available ?? 0} 条，不可订购 ${payload.summary.unavailable ?? 0} 条，被阻断 ${payload.summary.blocked ?? 0} 条，失败 ${payload.summary.error ?? 0} 条。`
      : "监控数据尚未加载。"
  );

  const statusNodes = document.querySelectorAll("[data-monitor-status]");
  if (!payload) {
    statusNodes.forEach((status) => {
      status.textContent = "加载监控数据中";
      status.classList.remove("has-warning");
    });
    setText("[data-trust-state]", "等待真实监控数据");
    setText("[data-trust-age]", "-");
    setText("[data-trust-freshness]", "加载中");
    return;
  }

  const directProblems = (payload.summary.blocked ?? 0) + (payload.summary.error ?? 0);
  const snapshotCount = products.filter((product) => product._evidenceBadge.value === "snapshot").length;
  const unavailableCount = products.filter((product) => product.status === "unavailable").length;
  const hasProblems = directProblems > 0;
  statusNodes.forEach((status) => {
    status.textContent = hasProblems ? "监控有异常源" : "监控正常";
    status.classList.toggle("has-warning", hasProblems);
  });

  setText("[data-trust-state]", `已加载 ${products.length} 条真实记录`);
  setText("[data-trust-age]", formatRelativeAge(payload.generatedAt));
  setText(
    "[data-trust-freshness]",
    snapshotCount > 0
      ? `${snapshotCount} 条第三方快照需复核`
      : unavailableCount > 0
        ? `${unavailableCount} 条不可订购`
        : "官方入口可核验"
  );
}

function renderResultCount(count) {
  const total = filterBaseProducts().length;
  setText("[data-result-count]", `显示 ${count} / ${total} 条`);
}

function renderEmpty(message) {
  const tableBody = document.querySelector("[data-products]");
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td class="empty-row" colspan="12">${escapeHtml(message)}</td>
      </tr>
    `;
  }
  renderMobileCards([], message);
  renderResultCount(0);
}

function renderEvidenceBadge(product) {
  const badge = product._evidenceBadge;
  return `<span class="stock evidence-badge ${escapeHtml(badge.className)}">${escapeHtml(badge.label)}</span>`;
}

function renderRiskTags(product) {
  const tags = product._riskTags
    .map((tag) => `<span class="risk-tag is-${escapeHtml(text(tag.severity, "medium"))}">${escapeHtml(tag.label)}</span>`)
    .join("");
  return `<span class="risk-list">${tags}</span>`;
}

function productHref(product) {
  return safeUrl(product.orderUrl || product.sourceUrl || product.finalUrl);
}

function renderTable() {
  setText("[data-title-category]", categoryNames[activeCategory]);
  const list = visibleProducts();
  if (list.length === 0) {
    renderEmpty("没有符合当前筛选条件的真实监控记录。");
    renderSelectedCount();
    return;
  }

  const tableBody = document.querySelector("[data-products]");
  if (tableBody) {
    tableBody.innerHTML = list
      .map((product) => {
        const checked = selected.has(product._stableKey) ? "checked" : "";
        const isActionable = product.status === "available" && product.orderUrl;
        const href = productHref(product);
        const actionText = isActionable ? "直达购买" : "查看源";
        const ipType = product._ipType;
        return `
          <tr>
            <td><input data-select="${escapeHtml(product._stableKey)}" type="checkbox" ${checked} aria-label="选择 ${escapeHtml(text(product.provider))} ${escapeHtml(text(product.name))} 对比" /></td>
            <td>
              <a class="provider-name" href="${escapeHtml(href)}" target="_blank" rel="nofollow sponsored noopener">${escapeHtml(text(product.provider))}</a>
              <span class="provider-meta">${escapeHtml(text(product.name))}</span>
            </td>
            <td>${escapeHtml(text(product.region))}</td>
            <td class="note-cell">${escapeHtml(text(product.note || product.evidence))}</td>
            <td><span class="type-badge ${escapeHtml(ipType.className)}">${escapeHtml(ipType.label)}</span></td>
            <td>${escapeHtml(text(product.route))}</td>
            <td>${escapeHtml(text(product.hardware))}</td>
            <td>${escapeHtml(text(product.bandwidth))}</td>
            <td><strong>${escapeHtml(text(product.price))}</strong></td>
            <td class="status-cell">
              <span class="status-list">
                <span class="stock ${escapeHtml(statusClass(product.status))}">${escapeHtml(text(product.statusLabel, statusLabels[product.status] ?? product.status))}</span>
                ${renderEvidenceBadge(product)}
              </span>
            </td>
            <td class="risk-cell">${renderRiskTags(product)}</td>
            <td><a class="table-link ${isActionable ? "" : "is-secondary"}" href="${escapeHtml(href)}" target="_blank" rel="nofollow sponsored noopener">${actionText}</a></td>
          </tr>
        `;
      })
      .join("");
  }
  renderMobileCards(list);
  renderResultCount(list.length);
  bindRowSelection();
  renderSelectedCount();
}

function renderMobileCards(list, emptyMessage = "没有符合当前筛选条件的真实监控记录。") {
  const container = document.querySelector("[data-mobile-products]");
  if (!container) return;
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-row">${escapeHtml(emptyMessage)}</p>`;
    return;
  }
  container.innerHTML = list
    .map((product) => {
      const checked = selected.has(product._stableKey) ? "checked" : "";
      const isActionable = product.status === "available" && product.orderUrl;
      const href = productHref(product);
      const actionText = isActionable ? "直达购买" : "查看源";
      return `
        <article class="mobile-product-card">
          <div class="mobile-card-head">
            <label>
              <input data-select="${escapeHtml(product._stableKey)}" type="checkbox" ${checked} aria-label="选择 ${escapeHtml(text(product.provider))} ${escapeHtml(text(product.name))} 对比" />
              <span>${escapeHtml(text(product.provider))}</span>
            </label>
          </div>
          <h3>${escapeHtml(text(product.name))}</h3>
          <p>${escapeHtml(text(product.note || product.evidence))}</p>
          <dl>
            <div><dt>区域</dt><dd>${escapeHtml(text(product.region))}</dd></div>
            <div><dt>类型</dt><dd><span class="type-badge ${escapeHtml(product._ipType.className)}">${escapeHtml(product._ipType.label)}</span></dd></div>
            <div><dt>线路</dt><dd>${escapeHtml(text(product.route))}</dd></div>
            <div><dt>配置</dt><dd>${escapeHtml(text(product.hardware))}</dd></div>
            <div><dt>流量</dt><dd>${escapeHtml(text(product.bandwidth))}</dd></div>
            <div><dt>价格</dt><dd><strong>${escapeHtml(text(product.price))}</strong></dd></div>
            <div><dt>状态</dt><dd><span class="stock ${escapeHtml(statusClass(product.status))}">${escapeHtml(text(product.statusLabel, statusLabels[product.status] ?? product.status))}</span></dd></div>
            <div><dt>证据</dt><dd>${renderEvidenceBadge(product)}</dd></div>
            <div><dt>风险</dt><dd class="risk-cell">${renderRiskTags(product)}</dd></div>
          </dl>
          <a class="table-link ${isActionable ? "" : "is-secondary"}" href="${escapeHtml(href)}" target="_blank" rel="nofollow sponsored noopener">${actionText}</a>
        </article>
      `;
    })
    .join("");
}

function renderSelectedCount() {
  setText("[data-selected-count]", selected.size);
  document.querySelectorAll("[data-open-compare]").forEach((button) => {
    button.disabled = selected.size < 2;
  });
}

function bindRowSelection() {
  document.querySelectorAll("[data-select]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) selected.add(input.dataset.select);
      else selected.delete(input.dataset.select);
      const escapedKey = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(input.dataset.select) : input.dataset.select.replaceAll('"', '\\"');
      document.querySelectorAll(`[data-select="${escapedKey}"]`).forEach((peer) => {
        peer.checked = input.checked;
      });
      renderSelectedCount();
    });
  });
}

function openCompare() {
  const chosen = products.filter((product) => selected.has(product._stableKey));
  const grid = document.querySelector("[data-compare-grid]");
  if (!grid) return;
  grid.innerHTML = chosen
    .map(
      (product) => `
        <article class="compare-card">
          <h3>${escapeHtml(text(product.provider))}</h3>
          <p>${escapeHtml(text(product.name))}</p>
          <dl>
            <div><dt>区域</dt><dd>${escapeHtml(text(product.region))}</dd></div>
            <div><dt>类型</dt><dd>${escapeHtml(product._ipType.label)}</dd></div>
            <div><dt>线路</dt><dd>${escapeHtml(text(product.route))}</dd></div>
            <div><dt>配置</dt><dd>${escapeHtml(text(product.hardware))}</dd></div>
            <div><dt>流量</dt><dd>${escapeHtml(text(product.bandwidth))}</dd></div>
            <div><dt>价格</dt><dd>${escapeHtml(text(product.price))}</dd></div>
            <div><dt>状态</dt><dd>${escapeHtml(text(product.statusLabel, statusLabels[product.status] ?? product.status))}</dd></div>
            <div><dt>证据</dt><dd>${escapeHtml(product._evidenceBadge.label)}</dd></div>
            <div><dt>风险</dt><dd>${escapeHtml(product._riskTags.map((tag) => tag.label).join(" / "))}</dd></div>
            <div><dt>抓取</dt><dd>${escapeHtml(formatDateTime(product.fetchedAt))}</dd></div>
          </dl>
          <p class="evidence">${escapeHtml(text(product.evidence))}</p>
        </article>
      `
    )
    .join("");
  document.querySelector("[data-compare-dialog]")?.showModal();
}

function optionLabel(label, count) {
  return `${label} (${count})`;
}

function countedOptions(list, valueGetter, labelGetter = valueGetter) {
  const counts = new Map();
  for (const item of list) {
    const value = valueGetter(item);
    if (!value) continue;
    const current = counts.get(value) || { value, label: labelGetter(item), count: 0 };
    current.count += 1;
    counts.set(value, current);
  }
  return [...counts.values()].sort((a, b) => text(a.label, "").localeCompare(text(b.label, ""), "zh-CN"));
}

function populateSelect(selector, allLabel, options, currentValue) {
  document.querySelectorAll(selector).forEach((select) => {
    if (!(select instanceof HTMLSelectElement)) return;
    const previous = options.some((option) => option.value === currentValue) ? currentValue : "all";
    select.innerHTML = [
      `<option value="all">${escapeHtml(allLabel)}</option>`,
      ...options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(optionLabel(option.label, option.count))}</option>`)
    ].join("");
    select.value = previous;
  });
}

function validFilterValue(key, options) {
  if (filters[key] !== "all" && !options.some((option) => option.value === filters[key])) {
    filters[key] = "all";
  }
  return filters[key];
}

function hydrateFilterOptions() {
  const regionOptions = countedOptions(products, (product) => product.region);
  const providerOptions = countedOptions(products, (product) => product.provider);
  const ipTypeOptions = countedOptions(
    products,
    (product) => product._ipType.value,
    (product) => product._ipType.label
  ).sort((a, b) => ipTypeOrder.indexOf(a.value) - ipTypeOrder.indexOf(b.value));
  const statusOptions = countedOptions(
    products,
    (product) => product.status,
    (product) => statusLabels[product.status] ?? product.statusLabel ?? product.status
  ).sort((a, b) => statusRank(a.value) - statusRank(b.value));
  const priceOptions = priceBands
    .map((band) => ({
      value: band.value,
      label: band.label,
      count: products.filter((product) => priceBandFor(product) === band.value).length
    }))
    .filter((band) => band.count > 0);

  populateSelect("[data-filter-region]", "全部区域", regionOptions, validFilterValue("region", regionOptions));
  populateSelect("[data-filter-provider]", "全部商家", providerOptions, validFilterValue("provider", providerOptions));
  populateSelect(
    "[data-filter-ip-type]",
    "全部 IP 类型",
    ipTypeOptions,
    validFilterValue("ipType", ipTypeOptions)
  );
  populateSelect(
    "[data-filter-status]",
    "全部状态",
    statusOptions,
    validFilterValue("status", statusOptions)
  );
  populateSelect(
    "[data-filter-price]",
    "全部价格",
    priceOptions,
    validFilterValue("price", priceOptions)
  );
}

function syncFilterControls() {
  document.querySelectorAll("[data-search]").forEach((input) => {
    input.value = filters.search;
  });
  const selectBindings = [
    ["[data-filter-region]", filters.region],
    ["[data-filter-provider]", filters.provider],
    ["[data-filter-ip-type]", filters.ipType],
    ["[data-filter-status]", filters.status],
    ["[data-filter-price]", filters.price]
  ];
  for (const [selector, value] of selectBindings) {
    document.querySelectorAll(selector).forEach((select) => {
      if ("value" in select) select.value = value;
    });
  }
}

function resetFilters() {
  filters.search = "";
  filters.region = "all";
  filters.provider = "all";
  filters.ipType = "all";
  filters.status = "all";
  filters.price = "all";
  syncFilterControls();
  renderTable();
}

function bindFilterControl(selector, key) {
  document.querySelectorAll(selector).forEach((control) => {
    const eventName = key === "search" ? "input" : "change";
    control.addEventListener(eventName, (event) => {
      filters[key] = event.target.value;
      renderTable();
    });
  });
}

function bindControls() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderTable();
    });
  });

  document.querySelectorAll("[data-sort]").forEach((sort) => {
    sort.addEventListener("change", (event) => {
      activeSort = event.target.value;
      renderTable();
    });
  });

  bindFilterControl("[data-search]", "search");
  bindFilterControl("[data-filter-region]", "region");
  bindFilterControl("[data-filter-provider]", "provider");
  bindFilterControl("[data-filter-ip-type]", "ipType");
  bindFilterControl("[data-filter-status]", "status");
  bindFilterControl("[data-filter-price]", "price");

  document.querySelectorAll("[data-filter-reset]").forEach((button) => {
    button.addEventListener("click", resetFilters);
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => {
      loadMonitorData();
    });
  });
  document.querySelectorAll("[data-open-compare]").forEach((button) => {
    button.addEventListener("click", openCompare);
  });
  document.querySelectorAll("[data-clear-compare]").forEach((button) => {
    button.addEventListener("click", () => {
      selected.clear();
      renderTable();
    });
  });

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const command = button.dataset.copy;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(command);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = command;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.append(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        const original = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(() => {
          button.textContent = original;
        }, 1200);
      } catch {
        button.textContent = "复制失败";
      }
    });
  });
}

async function loadMonitorData() {
  refreshClock();
  try {
    const response = await fetch(`data/products.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`监控数据加载失败：HTTP ${response.status}`);
    payload = await response.json();
    products = Array.isArray(payload.products) ? payload.products.map(normalizeProduct) : [];
    selected.clear();
    hydrateFilterOptions();
    syncFilterControls();
    renderCounts();
    renderSummary();
    renderTable();
  } catch (error) {
    payload = null;
    products = [];
    selected.clear();
    hydrateFilterOptions();
    renderCounts();
    renderSummary();
    renderEmpty(error.message);
    renderSelectedCount();
  }
}

refreshClock();
renderSummary();
bindControls();
loadMonitorData();
setInterval(refreshClock, 1000);
