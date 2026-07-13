import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, GeoJSON, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getCentroid, ROOM_OPTIONS } from '../utils/geo'
import { fetchProjectParams } from '../api/wfs'

function makeIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;
      background:${color};
      border-radius:50%;
      border:2px solid #fff;
      box-shadow:0 1px 5px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  })
}

const activeIcon         = makeIcon('#e74c3c')
const finishedIcon       = makeIcon('#27ae60')
const olderFinishedIcon  = makeIcon('#3498db')

const neighborhoodStyle = {
  color: '#2980b9',
  weight: 2,
  fillColor: '#2980b9',
  fillOpacity: 0.08,
}

// Flies the map to the neighborhood bounds whenever bbox changes
function FitBounds({ bbox }) {
  const map = useMap()
  useEffect(() => {
    if (!bbox) return
    const [minLon, minLat, maxLon, maxLat] = bbox
    map.flyToBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [40, 40] })
  }, [bbox, map])
  return null
}

function formatDate(isoStr) {
  if (!isoStr) return 'Não informado'
  return isoStr.slice(0, 10).split('-').reverse().join('/')
}

// Renders the residential-units-per-bedroom breakdown from SIATU params.
// `params`: undefined = still loading, null = no data recorded, object = data.
function RoomInfo({ params }) {
  if (params === undefined) {
    return <div className="popup-rooms loading">Carregando quartos…</div>
  }
  const q = params && params.unidadesResidenciaisPorQuarto
  const rows = q
    ? ROOM_OPTIONS
        .map(o => [o.label, q[o.key]])
        .filter(([, v]) => v != null)
    : []
  if (rows.length === 0) {
    return <div className="popup-rooms empty">Quartos: não informado</div>
  }
  return (
    <div className="popup-rooms">
      <div className="popup-rooms-title">Unidades por nº de quartos</div>
      <table className="popup-table">
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <td>{label} quarto{label === '1' ? '' : 's'}</td>
              <td><b>{v} unid.</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConstructionMarker({ f, icon }) {
  const p = f.properties
  const [lat, lon] = getCentroid(f.geometry)
  // undefined until the popup is first opened; then null (no data) or the params object.
  const [params, setParams] = useState(undefined)

  const handleOpen = () => {
    if (params !== undefined) return
    fetchProjectParams(p.ID_PROJETO_EDIFICACOES).then(d => setParams(d || null))
  }

  const googleUrl = p.ENDERECO
    ? `https://www.google.com/search?q=${encodeURIComponent(p.ENDERECO + ' Belo Horizonte')}`
    : null

  return (
    <Marker
      key={p.ID_PROJETO_EDIFICACOES}
      position={[lat, lon]}
      icon={icon}
      eventHandlers={{ popupopen: handleOpen }}
    >
      <Popup minWidth={240}>
        <div className="popup-content">
          <div className="popup-address">
            {p.ENDERECO || 'Endereço não disponível'}
          </div>
          <table className="popup-table">
            <tbody>
              <tr>
                <td>Início da obra</td>
                <td><b>{formatDate(p.DATA_COMUNICADO_INICIO_OBRA)}</b></td>
              </tr>
              {p.DATA_ULTIMA_BAIXA && (
                <tr>
                  <td>Baixa</td>
                  <td><b>{formatDate(p.DATA_ULTIMA_BAIXA)}</b></td>
                </tr>
              )}
              <tr>
                <td>Validade alvará</td>
                <td><b>{formatDate(p.DT_VALIDADE_ULTIMO_ALVARA)}</b></td>
              </tr>
              <tr>
                <td>Unidades</td>
                <td><b>{p.QTD_UND_RESIDENCIAL}</b></td>
              </tr>
              <tr>
                <td>Pavimentos</td>
                <td><b>{p.QTDE_PAVIMENTOS}</b></td>
              </tr>
              <tr>
                <td>Aprovação</td>
                <td><b>{p.DATA_APROVACAO}</b></td>
              </tr>
            </tbody>
          </table>

          <RoomInfo params={params} />

          <div className="popup-links">
            {p.LINK_SIATU_EDIFICACAO && (
              <span dangerouslySetInnerHTML={{ __html: p.LINK_SIATU_EDIFICACAO }} />
            )}
            {googleUrl && (
              <a href={googleUrl} target="_blank" rel="noopener noreferrer">
                Buscar no Google
              </a>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  )
}

export default function MapView({ bairroFeature, active, recentlyFinished, olderFinished, bbox }) {
  return (
    <MapContainer
      center={[-19.917, -43.934]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <ZoomControl position="topright" />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
        keepBuffer={6}
      />

      {bbox && <FitBounds bbox={bbox} />}

      {bairroFeature && (
        <GeoJSON
          key={bairroFeature.properties.NOME}
          data={bairroFeature}
          style={neighborhoodStyle}
        />
      )}

      {active.map(f => (
        <ConstructionMarker key={f.properties.ID_PROJETO_EDIFICACOES} f={f} icon={activeIcon} />
      ))}
      {recentlyFinished.map(f => (
        <ConstructionMarker key={f.properties.ID_PROJETO_EDIFICACOES} f={f} icon={finishedIcon} />
      ))}
      {olderFinished.map(f => (
        <ConstructionMarker key={f.properties.ID_PROJETO_EDIFICACOES} f={f} icon={olderFinishedIcon} />
      ))}
    </MapContainer>
  )
}
