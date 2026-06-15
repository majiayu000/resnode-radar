const providers = [
  {
    name: "AaITR",
    slug: "aaitr",
    region: "美国 / 日本",
    ipType: "真实家庭住宅 IP",
    bestFor: "美区 TikTok、电商账号、需要住宅属性的远程桌面",
    monthlyCny: 149,
    score: 91,
    latencyMs: 168,
    eveningLoss: 0.4,
    stock: "需要关注补货",
    commission: "待后台确认",
    affiliateUrl: "https://www.aaitr.com/",
    reviewUrl: "reviews/aaitr.html",
    tags: ["真家宽", "AT&T/Frontier", "日本 SoftBank", "中文支持"],
    caveat: "库存和交付周期是主要变量，推荐页必须标注更新时间。"
  },
  {
    name: "LisaHost",
    slug: "lisahost",
    region: "美国 / 新加坡 / 台湾 / 英国 / 越南",
    ipType: "双 ISP / 原生住宅 IP",
    bestFor: "多地区矩阵、跨境电商、流媒体与平台兼容测试",
    monthlyCny: 88,
    score: 86,
    latencyMs: 142,
    eveningLoss: 0.7,
    stock: "常规销售",
    commission: "有推广页面",
    affiliateUrl: "https://lisahost.com/affiliates.php",
    reviewUrl: "reviews/lisahost.html",
    tags: ["地区多", "支付宝", "月付", "中文工单"],
    caveat: "不同 IP 段表现差异明显，需要按段位记录测试结果。"
  },
  {
    name: "VPS.us",
    slug: "vps-us",
    region: "美国 / 日本",
    ipType: "常规 VPS",
    bestFor: "对照组、建站、普通代理与服务器基准线",
    monthlyCny: 72,
    score: 73,
    latencyMs: 188,
    eveningLoss: 0.5,
    stock: "稳定",
    commission: "10% recurring",
    affiliateUrl: "https://vps.us/affiliates/",
    reviewUrl: "#",
    tags: ["公开返佣", "90 天归因", "常规 VPS"],
    caveat: "不是住宅 IP，不能和真家宽直接混排为同类产品。"
  },
  {
    name: "VPSDime",
    slug: "vpsdime",
    region: "美国 / 欧洲",
    ipType: "常规 VPS",
    bestFor: "低价资源型 VPS、返佣模型验证",
    monthlyCny: 68,
    score: 70,
    latencyMs: 205,
    eveningLoss: 0.6,
    stock: "稳定",
    commission: "10% recurring",
    affiliateUrl: "https://vpsdime.com/affiliate-program",
    reviewUrl: "#",
    tags: ["公开返佣", "资源型", "对照组"],
    caveat: "适合作为返佣样本，不适合作为住宅 IP 推荐主力。"
  }
];

const filters = {
  all: () => true,
  residential: (provider) => provider.ipType.includes("住宅") || provider.ipType.includes("ISP"),
  us: (provider) => provider.region.includes("美国"),
  affiliate: (provider) => provider.commission.includes("推广") || provider.commission.includes("recurring")
};

let activeFilter = "all";
let activeSort = "score";

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
}

function sortedProviders() {
  const list = providers.filter(filters[activeFilter]);
  return [...list].sort((a, b) => {
    if (activeSort === "latency") return a.latencyMs - b.latencyMs;
    if (activeSort === "price") return a.monthlyCny - b.monthlyCny;
    return b.score - a.score;
  });
}

function renderLeaderboard() {
  const tbody = document.querySelector("[data-leaderboard]");
  tbody.innerHTML = sortedProviders()
    .map((provider, index) => {
      const rank = index + 1;
      return `
        <tr>
          <td><span class="rank">${rank}</span></td>
          <td>
            <a class="provider-name" href="${provider.reviewUrl}">${provider.name}</a>
            <span class="provider-meta">${provider.region} · ${provider.ipType}</span>
          </td>
          <td>${provider.score}</td>
          <td>${provider.latencyMs} ms</td>
          <td>${provider.eveningLoss}%</td>
          <td>${formatMoney(provider.monthlyCny)}/月起</td>
          <td>${provider.commission}</td>
          <td><a class="table-link" href="${provider.affiliateUrl}" target="_blank" rel="nofollow sponsored noopener">查看</a></td>
        </tr>
      `;
    })
    .join("");
}

function renderCards() {
  const grid = document.querySelector("[data-provider-cards]");
  grid.innerHTML = sortedProviders()
    .map((provider) => {
      const tagHtml = provider.tags.map((tag) => `<span>${tag}</span>`).join("");
      return `
        <article class="provider-card">
          <div class="card-head">
            <div>
              <h3>${provider.name}</h3>
              <p>${provider.bestFor}</p>
            </div>
            <strong>${provider.score}</strong>
          </div>
          <div class="metric-stack" aria-label="${provider.name} 指标">
            <div><span>延迟</span><meter min="80" max="260" low="160" high="220" optimum="110" value="${provider.latencyMs}"></meter><b>${provider.latencyMs}ms</b></div>
            <div><span>晚高峰丢包</span><meter min="0" max="3" low="0.5" high="1.5" optimum="0.1" value="${provider.eveningLoss}"></meter><b>${provider.eveningLoss}%</b></div>
          </div>
          <div class="tag-row">${tagHtml}</div>
          <p class="caveat">${provider.caveat}</p>
          <div class="card-actions">
            <a href="${provider.reviewUrl}">读测评</a>
            <a href="${provider.affiliateUrl}" target="_blank" rel="nofollow sponsored noopener">推广入口</a>
          </div>
        </article>
      `;
    })
    .join("");
}

function updateRevenue() {
  const clicks = Number(document.querySelector("#clicks").value);
  const conversion = Number(document.querySelector("#conversion").value);
  const arpu = Number(document.querySelector("#arpu").value);
  const commission = Number(document.querySelector("#commission").value);
  const sales = Math.round(clicks * (conversion / 100));
  const monthly = Math.round(sales * arpu * (commission / 100));
  document.querySelector("[data-clicks]").textContent = clicks.toLocaleString("zh-CN");
  document.querySelector("[data-conversion]").textContent = `${conversion}%`;
  document.querySelector("[data-arpu]").textContent = formatMoney(arpu);
  document.querySelector("[data-commission]").textContent = `${commission}%`;
  document.querySelector("[data-sales]").textContent = sales.toLocaleString("zh-CN");
  document.querySelector("[data-monthly]").textContent = formatMoney(monthly);
}

function bindControls() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderLeaderboard();
      renderCards();
    });
  });

  document.querySelector("#sort").addEventListener("change", (event) => {
    activeSort = event.target.value;
    renderLeaderboard();
    renderCards();
  });

  document.querySelectorAll(".range-row input").forEach((input) => {
    input.addEventListener("input", updateRevenue);
  });

  document.querySelector("[data-copy]").addEventListener("click", async () => {
    const text = "我可能通过页面里的推荐链接获得佣金，但排序优先按实测速度、IP 类型、退款政策和稳定性评分。";
    await navigator.clipboard.writeText(text);
    document.querySelector("[data-copy]").textContent = "已复制";
    setTimeout(() => {
      document.querySelector("[data-copy]").textContent = "复制披露文案";
    }, 1600);
  });
}

renderLeaderboard();
renderCards();
updateRevenue();
bindControls();
