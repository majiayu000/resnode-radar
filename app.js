const products = [
  {
    id: "vircs-att-home",
    category: "home",
    recommended: true,
    provider: "VIRCS",
    name: "ATT 真实住宅",
    region: "美国",
    note: "独享宽带，适合 TikTok 直播和跨境电商；待补本站购买截图。",
    route: "普通线路 · 电:163 联:4837 移:CMI",
    hardware: "4C / 8G / 50G",
    bandwidth: "无限流量 @ 50Mbps",
    price: "$35.99/月",
    priceValue: 260,
    status: "有货",
    stockRank: 1,
    updated: "2026-06-15",
    reviewUrl: "#guide",
    buyUrl: "https://www.vircs.com/products/4",
    evidence: "待补：IPinfo、晚高峰 speedtest、连续 24h 可用性。"
  },
  {
    id: "aaitr-frontier-home",
    category: "home",
    recommended: true,
    provider: "AaITR",
    name: "Frontier 真实住宅",
    region: "美国",
    note: "建议预定，适合需要美国家庭宽带属性的远程桌面。",
    route: "普通线路 · 电:163 联:4837 移:CMI",
    hardware: "2C / 2G / 25G",
    bandwidth: "2000G @ 100Mbps",
    price: "¥149.00/月",
    priceValue: 149,
    status: "有货",
    stockRank: 1,
    updated: "2026-06-15",
    reviewUrl: "reviews/aaitr.html",
    buyUrl: "https://www.aaitr.com/",
    evidence: "待补：Frontier 段位截图、三网 ping、mtr、TikTok 可用性记录。"
  },
  {
    id: "aaitr-att-home",
    category: "home",
    recommended: false,
    provider: "AaITR",
    name: "ATT 真实住宅",
    region: "美国",
    note: "建议预定。库存变化快，缺货时不要强推。",
    route: "普通线路 · 电:163 联:4837 移:CMI",
    hardware: "2C / 2G / 25G",
    bandwidth: "2000G @ 100Mbps",
    price: "¥149.00/月",
    priceValue: 149,
    status: "缺货",
    stockRank: 3,
    updated: "2026-06-15",
    reviewUrl: "reviews/aaitr.html",
    buyUrl: "https://www.aaitr.com/",
    evidence: "待补：补货时间、交付周期、退款规则。"
  },
  {
    id: "lisahost-us-isp",
    category: "home",
    recommended: false,
    provider: "LisaHost",
    name: "美国双 ISP",
    region: "美国",
    note: "地区和 IP 段较多，必须按套餐单独记录。",
    route: "普通线路 · 待测三网",
    hardware: "1C / 1G / 20G 起",
    bandwidth: "按套餐",
    price: "¥88.00/月起",
    priceValue: 88,
    status: "待实测",
    stockRank: 2,
    updated: "2026-06-15",
    reviewUrl: "reviews/lisahost.html",
    buyUrl: "https://lisahost.com/",
    evidence: "待补：不同地区 IP 属性、晚高峰稳定性。"
  },
  {
    id: "bandwagon-cn2gia",
    category: "premium",
    recommended: false,
    provider: "搬瓦工",
    name: "CN2 GIA",
    region: "美国 / 日本",
    note: "顶级线路对照组，不属于家宽 IP。",
    route: "CN2 GIA",
    hardware: "按套餐",
    bandwidth: "按套餐",
    price: "$49.99/季起",
    priceValue: 360,
    status: "待录入",
    stockRank: 2,
    updated: "2026-06-15",
    reviewUrl: "#guide",
    buyUrl: "#",
    evidence: "用于和家宽 VPS 搭配中转时做对照。"
  },
  {
    id: "evoxt-budget",
    category: "cheap",
    recommended: false,
    provider: "EVOXT",
    name: "便宜 VPS",
    region: "美国 / 欧洲",
    note: "低价普通 VPS 对照组，不作为住宅 IP 推荐。",
    route: "普通线路",
    hardware: "1C / 512M 起",
    bandwidth: "按套餐",
    price: "$2.99/月起",
    priceValue: 22,
    status: "待录入",
    stockRank: 2,
    updated: "2026-06-15",
    reviewUrl: "#guide",
    buyUrl: "#",
    evidence: "只做价格和线路对照，不混入家宽推荐。"
  }
];

const categoryNames = {
  all: "全部产品",
  home: "家宽",
  premium: "顶级线路",
  cheap: "便宜 VPS"
};

let activeCategory = "home";
let activeSort = "recommend";
const selected = new Set();

function formatTime(date) {
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function refreshClock() {
  const now = new Date();
  document.querySelector("[data-now]").textContent = formatTime(now);
  document.querySelector("[data-sync]").textContent = formatTime(now);
}

function visibleProducts() {
  const list = activeCategory === "all" ? products : products.filter((product) => product.category === activeCategory);
  return [...list].sort((a, b) => {
    if (activeSort === "price") return a.priceValue - b.priceValue;
    if (activeSort === "stock") return a.stockRank - b.stockRank;
    if (activeSort === "updated") return b.updated.localeCompare(a.updated);
    return Number(b.recommended) - Number(a.recommended) || a.stockRank - b.stockRank || a.priceValue - b.priceValue;
  });
}

function renderCounts() {
  document.querySelector("[data-count-all]").textContent = products.length;
  document.querySelector("[data-count-home]").textContent = products.filter((product) => product.category === "home").length;
  document.querySelector("[data-count-premium]").textContent = products.filter((product) => product.category === "premium").length;
  document.querySelector("[data-count-cheap]").textContent = products.filter((product) => product.category === "cheap").length;
}

function statusClass(status) {
  if (status === "有货") return "is-stock";
  if (status === "缺货") return "is-empty";
  return "is-pending";
}

function renderTable() {
  document.querySelector("[data-title-category]").textContent = categoryNames[activeCategory];
  const tbody = document.querySelector("[data-products]");
  tbody.innerHTML = visibleProducts()
    .map((product) => {
      const checked = selected.has(product.id) ? "checked" : "";
      const buyDisabled = product.buyUrl === "#" ? "is-disabled" : "";
      return `
        <tr>
          <td><input data-select="${product.id}" type="checkbox" ${checked} aria-label="选择 ${product.provider} ${product.name} 对比" /></td>
          <td>${product.recommended ? '<span class="recommend">推荐</span>' : '<span class="muted">-</span>'}</td>
          <td>
            <a class="provider-name" href="${product.reviewUrl}">${product.provider}</a>
            <span class="provider-meta">${product.name}</span>
          </td>
          <td>${product.region}</td>
          <td class="note-cell">${product.note}</td>
          <td>${product.route}</td>
          <td>${product.hardware}</td>
          <td>${product.bandwidth}</td>
          <td><strong>${product.price}</strong></td>
          <td><span class="stock ${statusClass(product.status)}">${product.status}</span></td>
          <td><a class="table-link ${buyDisabled}" href="${product.buyUrl}" target="_blank" rel="nofollow sponsored noopener">直达购买</a></td>
        </tr>
      `;
    })
    .join("");
  bindRowSelection();
  renderSelectedCount();
}

function renderSelectedCount() {
  document.querySelector("[data-selected-count]").textContent = selected.size;
  document.querySelector("[data-open-compare]").disabled = selected.size < 2;
}

function bindRowSelection() {
  document.querySelectorAll("[data-select]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) selected.add(input.dataset.select);
      else selected.delete(input.dataset.select);
      renderSelectedCount();
    });
  });
}

function openCompare() {
  const chosen = products.filter((product) => selected.has(product.id));
  const grid = document.querySelector("[data-compare-grid]");
  grid.innerHTML = chosen
    .map(
      (product) => `
        <article class="compare-card">
          <h3>${product.provider}</h3>
          <p>${product.name}</p>
          <dl>
            <div><dt>区域</dt><dd>${product.region}</dd></div>
            <div><dt>线路</dt><dd>${product.route}</dd></div>
            <div><dt>配置</dt><dd>${product.hardware}</dd></div>
            <div><dt>流量</dt><dd>${product.bandwidth}</dd></div>
            <div><dt>价格</dt><dd>${product.price}</dd></div>
            <div><dt>状态</dt><dd>${product.status}</dd></div>
          </dl>
          <p class="evidence">${product.evidence}</p>
        </article>
      `
    )
    .join("");
  document.querySelector("[data-compare-dialog]").showModal();
}

function bindControls() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderTable();
    });
  });

  document.querySelector("[data-sort]").addEventListener("change", (event) => {
    activeSort = event.target.value;
    renderTable();
  });

  document.querySelector("[data-refresh]").addEventListener("click", refreshClock);
  document.querySelector("[data-open-compare]").addEventListener("click", openCompare);
  document.querySelector("[data-clear-compare]").addEventListener("click", () => {
    selected.clear();
    renderTable();
  });
}

refreshClock();
setInterval(refreshClock, 300000);
renderCounts();
renderTable();
bindControls();
