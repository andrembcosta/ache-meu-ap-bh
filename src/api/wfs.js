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
