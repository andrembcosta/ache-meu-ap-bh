# construcoes-app — Project Notes

## What it does

A React app that lets you type a Belo Horizonte neighborhood name and see:
- **Red markers** — active residential construction projects (in progress)
- **Green markers** — recently finished constructions (baixa in last 6 months)
- **Blue polygon** — the neighborhood boundary
- Clicking a marker shows the address, construction start date, permit validity, units, floors, and a link to the SIATU municipal system.

---

## Running it

```bash
cd construcoes-app
npm run dev   # starts at http://localhost:5173
```

The Vite dev server proxies all `/wfs?...` requests to the BHMap API (handles CORS + User-Agent automatically).

---

## BHMap WFS API

**Base URL:** `https://bhmap.pbh.gov.br/v2/api/idebhgeo/wfs`

This is a GeoServer instance exposed behind a GoCache WAF (Web Application Firewall).

### Critical gotchas

| Problem | Cause | Solution |
|---|---|---|
| 403 Forbidden | Missing browser User-Agent | Always set `User-Agent: Mozilla/5.0 ...` |
| 403 on CQL_FILTER with AND | WAF blocks SQL-like patterns | Use `BBOX` param + filter client-side in JS/Python |
| BBOX captures whole city | Data is EPSG:31983 (UTM), not WGS84 | Always add `srsName=EPSG:4326` to get lat/lon coords |
| Single-condition CQL works | WAF only blocks multi-condition filters | Simple `FIELD='VALUE'` is OK, `AND` is not |

### Minimal working request (Python)

```python
import urllib.request, json, urllib.parse

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

url = "https://bhmap.pbh.gov.br/v2/api/idebhgeo/wfs?" + urllib.parse.urlencode({
    "service": "WFS",
    "version": "2.0.0",
    "request": "GetFeature",
    "typeNames": "ide_bhgeo:BAIRRO_POPULAR",
    "outputFormat": "application/json",
    "srsName": "EPSG:4326",   # ALWAYS include this
})
req = urllib.request.Request(url, headers={"User-Agent": UA})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)
```

### BBOX spatial filter (the workaround for AND)

```python
# Get neighborhood bbox first, then:
url = "https://bhmap.pbh.gov.br/v2/api/idebhgeo/wfs?" + urllib.parse.urlencode({
    "service": "WFS", "version": "2.0.0", "request": "GetFeature",
    "typeNames": "ide_bhgeo:PROJETO_EDIFICACAO_LICENCIADO",
    "outputFormat": "application/json",
    "srsName": "EPSG:4326",
    "BBOX": f"{minLon},{minLat},{maxLon},{maxLat},EPSG:4326",
})
# Then filter properties in Python/JS (no CQL needed)
```

### Discover all layers

```python
url = "https://bhmap.pbh.gov.br/v2/api/idebhgeo/wfs?service=WFS&version=2.0.0&request=GetCapabilities"
# Returns 333 layers total
```

---

## Key layers

### `BAIRRO_POPULAR` — Neighborhood boundaries
- 493 neighborhoods, polygon geometry
- Fields: `ID`, `CODIGO`, `NOME`, `AREA_KM2`, `PERIMETR_M`
- Names use accents: `"Padre Eustáquio"` not `"Padre Eustaquio"`
- Use normalize + includes() for accent-insensitive search in JS

### `PROJETO_EDIFICACAO_LICENCIADO` — Licensed building projects
- 83,017 features, MultiPolygon (building footprint)
- Key fields:

| Field | Description |
|---|---|
| `ID_PROJETO_EDIFICACOES` | Unique ID |
| `ENDERECO` | Street address (often null) |
| `TIPO` | `LICENCIAMENTO` or `REGULARIZACAO` |
| `USO_GERAL` | `RESIDENCIAL`, `NÃO RESIDENCIAL`, `MISTO` |
| `TITULO_PROJETO` | `APROVACAO INICIAL`, `MODIFICACAO COM ACRESCIMO DE AREA CONSTRUIDA`, etc. |
| `SITUACAO_PROJETO` | `APROVADO` etc. |
| `TIPO_ULTIMA_BAIXA` | `null` (active), `BAIXA PARCIAL`, `BAIXA TOTAL` (done) |
| `DATA_ULTIMA_BAIXA` | ISO date of last baixa (e.g. `"2025-04-01Z"`) |
| `DATA_COMUNICADO_INICIO_OBRA` | ISO date construction started |
| `DT_VALIDADE_ULTIMO_ALVARA` | ISO date permit expires |
| `DT_EMISSAO_ALVARA_CONSTRUCAO` | ISO date permit issued |
| `DATA_APROVACAO` | `"DD/MM/YYYY"` format — approval date |
| `QTD_UND_RESIDENCIAL` | Number of residential units |
| `QTDE_PAVIMENTOS` | Number of floors |
| `AREA_CONSTRUIDA` | Built area in m² |
| `LOTE_PROJETO` | Fiscal zone / block / lot reference |
| `LINK_SIATU_EDIFICACAO` | HTML `<a>` tag linking to SIATU system |

**Multiple entries per address are normal** — deduplication is needed (keep latest `DATA_APROVACAO`).

### Active construction filter logic (client-side)
```js
function isActive(p) {
  if (p.TIPO !== 'LICENCIAMENTO') return false
  if (p.USO_GERAL !== 'RESIDENCIAL') return false
  if (p.TIPO_ULTIMA_BAIXA === 'BAIXA TOTAL') return false
  const start = p.DATA_COMUNICADO_INICIO_OBRA
  if (start && start.slice(0, 4) < '2020') return false  // too old
  const hasValidPermit = p.DT_VALIDADE_ULTIMO_ALVARA >= TODAY
  const hasRecentStart = start && start.slice(0, 4) >= '2020'
  return hasValidPermit || hasRecentStart
}
```

### `CADASTRO_IMOBILIARIO` — IPTU property registry
- 894,107 features, per-unit level
- Has: `TIPO_CONSTRUTIVO`, `TIPO_OCUPACAO`, `ANO_CONSTRUCAO`, `AREA_TERRENO`, `AREA_CONSTRUCAO`, `PADRAO_ACABAMENTO`, `NOME_LOGRADOURO`, `NUMERO_IMOVEL`, `CEP`, `ZONA_HOMOGENIA`
- **No price or ownership data**

### What the API does NOT have
- Property sale prices / ITBI transaction data
- Ownership history
- Any real estate market data

For transaction data, you'd need: FIPE ZAP, QuintoAndar/Viva Real APIs, or the PBH ITBI portal (not in WFS).

---

## App architecture

```
construcoes-app/
├── vite.config.js              # Vite proxy: /wfs → bhmap.pbh.gov.br (adds User-Agent)
├── src/
│   ├── api/wfs.js              # fetchBairros(), fetchProjectsByBbox()
│   ├── utils/geo.js            # getBbox, getCentroid, processFeatures (filter + dedup)
│   ├── components/MapView.jsx  # react-leaflet map, red/green markers, popups
│   ├── App.jsx                 # Search input with accent-insensitive autocomplete
│   └── App.css                 # Dark sidebar + map layout
```

### Vite proxy (the key to making browser requests work)

```js
// vite.config.js
proxy: {
  '/wfs': {
    target: 'https://bhmap.pbh.gov.br',
    changeOrigin: true,
    rewrite: path => path.replace(/^\/wfs/, '/v2/api/idebhgeo/wfs'),
    headers: { 'User-Agent': 'Mozilla/5.0 ...' },
  }
}
```

The browser fetches `/wfs?...`, Vite rewrites to the real URL server-side — bypasses both CORS and the WAF User-Agent requirement.

### Deduplication strategy
Group features by `ENDERECO`. For each group keep the feature with the latest `DATA_APROVACAO` (format `"DD/MM/YYYY"`). Features with null address get a unique key `__noid_{ID}` so they're never merged.

### Map markers
Custom `L.divIcon` (colored circle) instead of Leaflet's default PNG markers — avoids the Vite image bundling issue where marker icons break in production.
