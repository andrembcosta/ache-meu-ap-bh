// Normalize string for accent-insensitive search
export function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Collect all coordinate pairs from any GeoJSON geometry
function collectCoords(c) {
  if (typeof c[0] === 'number') return [c]
  return c.flatMap(collectCoords)
}

// Returns [minLon, minLat, maxLon, maxLat]
export function getBbox(geometry) {
  const coords = collectCoords(geometry.coordinates)
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

// Returns [lat, lon] for Leaflet
export function getCentroid(geometry) {
  const [minLon, minLat, maxLon, maxLat] = getBbox(geometry)
  return [(minLat + maxLat) / 2, (minLon + maxLon) / 2]
}

// Parse "DD/MM/YYYY" → Date
function parseApprovalDate(str) {
  if (!str) return new Date(0)
  const [d, m, y] = str.split('/')
  return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
}

const TODAY = new Date().toISOString().slice(0, 10)

const SIX_MONTHS_AGO = (() => {
  const d = new Date()
  d.setMonth(d.getMonth() - 6)
  return d.toISOString().slice(0, 10)
})()

const TWENTY_FOUR_MONTHS_AGO = (() => {
  const d = new Date()
  d.setMonth(d.getMonth() - 24)
  return d.toISOString().slice(0, 10)
})()

function isActiveConstruction(p) {
  if (p.TIPO !== 'LICENCIAMENTO') return false
  if (p.USO_GERAL !== 'RESIDENCIAL') return false
  if (p.TIPO_ULTIMA_BAIXA === 'BAIXA TOTAL') return false

  const startDate = p.DATA_COMUNICADO_INICIO_OBRA
  // If we know it started before 2020, it's too old to be relevant
  if (startDate && startDate.slice(0, 4) < '2020') return false

  const hasValidPermit =
    p.DT_VALIDADE_ULTIMO_ALVARA && p.DT_VALIDADE_ULTIMO_ALVARA.slice(0, 10) >= TODAY
  const hasRecentStart = startDate && startDate.slice(0, 4) >= '2020'

  return hasValidPermit || hasRecentStart
}

function isRecentlyFinished(p) {
  if (p.TIPO !== 'LICENCIAMENTO') return false
  if (p.USO_GERAL !== 'RESIDENCIAL') return false
  if (!p.DATA_ULTIMA_BAIXA) return false
  return p.DATA_ULTIMA_BAIXA.slice(0, 10) >= SIX_MONTHS_AGO
}

function isOlderFinished(p) {
  if (p.TIPO !== 'LICENCIAMENTO') return false
  if (p.USO_GERAL !== 'RESIDENCIAL') return false
  if (!p.DATA_ULTIMA_BAIXA) return false
  const date = p.DATA_ULTIMA_BAIXA.slice(0, 10)
  return date >= TWENTY_FOUR_MONTHS_AGO && date < SIX_MONTHS_AGO
}

function isApartment(p) {
  return Number(p.QTD_UND_RESIDENCIAL) >= 3 && Number(p.QTDE_PAVIMENTOS) >= 3
}

// The four bedroom classes SIATU tracks. `value` 4 means "4 or more".
export const ROOM_OPTIONS = [
  { value: 1, key: '1quarto', label: '1' },
  { value: 2, key: '2quartos', label: '2' },
  { value: 3, key: '3quartos', label: '3' },
  { value: 4, key: '4oumaisquartos', label: '4+' },
]

// Given a SIATU params object, returns a Set of bedroom classes the building has
// units for (e.g. {2, 3}). Empty set means no bedroom data was recorded.
export function roomClasses(params) {
  const q = params && params.unidadesResidenciaisPorQuarto
  const set = new Set()
  if (!q) return set
  for (const { value, key } of ROOM_OPTIONS) {
    if (q[key]) set.add(value)
  }
  return set
}

// Run async `fn` over `items` with at most `limit` in flight at once.
export async function runPool(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

// Deduplicate by address (keep latest DATA_APROVACAO per address), then split
// into active constructions and recently finished ones. Houses are excluded
// up front so all categories only contain apartment-style buildings.
export function processFeatures(features) {
  const grouped = new Map()

  for (const f of features) {
    const key = f.properties.ENDERECO
      ? f.properties.ENDERECO
      : `__noid_${f.properties.ID_PROJETO_EDIFICACOES}`

    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, f)
    } else {
      const existingDate = parseApprovalDate(existing.properties.DATA_APROVACAO)
      const currentDate = parseApprovalDate(f.properties.DATA_APROVACAO)
      if (currentDate > existingDate) grouped.set(key, f)
    }
  }

  const deduped = Array.from(grouped.values()).filter(f => isApartment(f.properties))
  return {
    active: deduped.filter(f => isActiveConstruction(f.properties)),
    recentlyFinished: deduped.filter(f => isRecentlyFinished(f.properties)),
    olderFinished: deduped.filter(f => isOlderFinished(f.properties)),
  }
}
