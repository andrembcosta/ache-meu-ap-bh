// Proxies the SIATU Edificações "parâmetros urbanísticos" endpoint, which
// carries the residential-units-per-bedroom breakdown (unidadesResidenciaisPorQuarto).
// Same User-Agent trick as api/wfs.js — the upstream WAF rejects requests without a browser UA.
export default async function handler(req, res) {
  const { id } = req.query
  if (!id || !/^\d+$/.test(String(id))) {
    res.status(400).json({ error: 'missing or invalid id' })
    return
  }

  const url = `https://urbano.pbh.gov.br/edificacoes/api/v1/projetos/${id}/parametros-urbanisticos`

  const upstream = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  })

  const data = await upstream.text()
  res.setHeader(
    'Content-Type',
    upstream.headers.get('Content-Type') || 'application/json'
  )
  res.status(upstream.status).send(data)
}
