export default async function handler(req, res) {
  const params = new URLSearchParams(req.query)
  const url = `https://bhmap.pbh.gov.br/v2/api/idebhgeo/wfs?${params}`

  const upstream = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  const data = await upstream.text()
  res.setHeader(
    'Content-Type',
    upstream.headers.get('Content-Type') || 'application/json'
  )
  res.status(upstream.status).send(data)
}
