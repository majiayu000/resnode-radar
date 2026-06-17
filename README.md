# ResNode Radar

VPS stock monitor and owner-run review site for Chinese cross-border operators.

## Local Preview

```sh
npm run assets
npm run monitor
npm run monitor:validate
npm run check
npm run serve
```

Open `http://127.0.0.1:4173/`.

## Update Data

Provider sources live in `monitor/sources.json`. Generated monitor output lives in `data/products.json`.

The public frontend reads `data/products.json`; it does not contain fallback mock products. If a provider blocks scraping or parsing fails, the generated record must show `blocked` or `error`.

## Monitoring

```sh
npm run monitor
npm run monitor:validate
```

GitHub Actions runs `.github/workflows/monitor.yml` every 30 minutes and commits `data/products.json` when live provider data changes.

Current adapters cover VIRCS, LisaHost, ZoroCloud, CstoneCloud, 学长网络, YINNET, PoloCloud, ZLIDC, and AaITR. `available` means the parser found a provider-backed positive stock count or an official order path; when stock count is not stated, the evidence field labels it as an order entry rather than precise stock.
