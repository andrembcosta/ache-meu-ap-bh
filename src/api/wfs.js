const BASE = '/api/wfs'

export async function fetchBairros() {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'ide_bhgeo:BAIRRO_POPULAR',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
  })
  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).features
}

export async function fetchProjectsByBbox(minLon, minLat, maxLon, maxLat) {
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'ide_bhgeo:PROJETO_EDIFICACAO_LICENCIADO',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    BBOX: `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`,
  })
  const res = await fetch(`${BASE}?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()).features
}

// Fetch the SIATU "parâmetros urbanísticos" for a project (bedroom breakdown, etc).
// Returns the params object, or null when unavailable. Cached by project id so the
// on-click popup and the room filter never fetch the same building twice; failed
// lookups are evicted so they can be retried later.
const paramsCache = new Map()

export function fetchProjectParams(id) {
  if (paramsCache.has(id)) return paramsCache.get(id)
  const promise = (async () => {
    try {
      const res = await fetch(`/api/siatu?id=${id}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  })()
  paramsCache.set(id, promise)
  promise.then(v => { if (v == null) paramsCache.delete(id) })
  return promise
}
