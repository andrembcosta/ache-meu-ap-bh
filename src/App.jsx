import { useState, useEffect, useMemo } from 'react'
import MapView from './components/MapView'
import { fetchBairros, fetchProjectsByBbox, fetchProjectParams } from './api/wfs'
import { normalize, getBbox, processFeatures, roomClasses, runPool, ROOM_OPTIONS } from './utils/geo'
import './App.css'

export default function App() {
  const [bairros, setBairros] = useState([])
  const [bairrosLoading, setBairrosLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedBairro, setSelectedBairro] = useState(null)
  const [active, setActive] = useState([])
  const [recentlyFinished, setRecentlyFinished] = useState([])
  const [olderFinished, setOlderFinished] = useState([])
  const [bbox, setBbox] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(true)
  // Room filter: which bedroom classes are selected (empty = no filter), the fetched
  // SIATU params keyed by project id, and whether a prefetch batch is in flight.
  const [selectedRooms, setSelectedRooms] = useState([])
  const [roomParams, setRoomParams] = useState({})
  const [roomsLoading, setRoomsLoading] = useState(false)

  // Load all bairros once on mount
  useEffect(() => {
    fetchBairros()
      .then(setBairros)
      .catch(err => setError('Erro ao carregar bairros: ' + err.message))
      .finally(() => setBairrosLoading(false))
  }, [])

  // Update suggestions as the user types
  useEffect(() => {
    if (query.length < 2 || !showSuggestions) {
      setSuggestions([])
      return
    }
    const q = normalize(query)
    setSuggestions(
      bairros
        .filter(b => normalize(b.properties.NOME).includes(q))
        .slice(0, 8)
    )
  }, [query, bairros, showSuggestions])

  async function selectBairro(bairro) {
    setSelectedBairro(bairro)
    setQuery(bairro.properties.NOME)
    setSuggestions([])
    setShowSuggestions(false)
    setActive([])
    setRecentlyFinished([])
    setOlderFinished([])
    setError(null)

    const bb = getBbox(bairro.geometry)
    setBbox(bb)

    setLoading(true)
    try {
      const features = await fetchProjectsByBbox(...bb)
      const { active, recentlyFinished, olderFinished } = processFeatures(features)
      setActive(active)
      setRecentlyFinished(recentlyFinished)
      setOlderFinished(olderFinished)
    } catch (err) {
      setError('Erro ao carregar projetos: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const allShown = useMemo(
    () => [...active, ...recentlyFinished, ...olderFinished],
    [active, recentlyFinished, olderFinished]
  )

  // Prefetch bedroom data for the shown buildings — but only once a room filter is
  // actually engaged, so plain browsing sends zero extra requests. Bounded to 8 in
  // flight; fetchProjectParams caches so nothing is fetched twice.
  useEffect(() => {
    if (selectedRooms.length === 0) return
    const missing = allShown
      .map(f => f.properties.ID_PROJETO_EDIFICACOES)
      .filter(id => !(id in roomParams))
    if (missing.length === 0) return
    let cancelled = false
    setRoomsLoading(true)
    runPool(missing, 8, id => fetchProjectParams(id).then(p => [id, p || null]))
      .then(entries => {
        if (cancelled) return
        setRoomParams(prev => {
          const next = { ...prev }
          for (const [id, p] of entries) next[id] = p
          return next
        })
      })
      .finally(() => { if (!cancelled) setRoomsLoading(false) })
    return () => { cancelled = true }
    // roomParams intentionally omitted to avoid re-running after we populate it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRooms, allShown])

  // Apply the room filter. Buildings with no recorded bedroom data are hidden while
  // a filter is active (per product decision).
  const { fActive, fRecent, fOlder } = useMemo(() => {
    const match = f => {
      if (selectedRooms.length === 0) return true
      const classes = roomClasses(roomParams[f.properties.ID_PROJETO_EDIFICACOES])
      if (classes.size === 0) return false
      return selectedRooms.some(r => classes.has(r))
    }
    return {
      fActive: active.filter(match),
      fRecent: recentlyFinished.filter(match),
      fOlder: olderFinished.filter(match),
    }
  }, [active, recentlyFinished, olderFinished, selectedRooms, roomParams])

  function toggleRoom(value) {
    setSelectedRooms(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }

  return (
    <div className="app">
      {expanded && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>Construções em BH</h1>
            <p className="subtitle">
              Projetos de edificação residencial licenciados e ativos
            </p>
          </div>

          <div className="search-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder={bairrosLoading ? 'Carregando bairros…' : 'Digite o nome do bairro…'}
              disabled={bairrosLoading}
              value={query}
              onChange={e => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map(b => (
                  <li
                    key={b.properties.ID}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectBairro(b)}
                  >
                    {b.properties.NOME}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="status-area">
            {loading && (
              <div className="status">
                <span className="spinner" /> Buscando construções…
              </div>
            )}
            {error && <div className="status error">{error}</div>}
            {!loading && selectedBairro && !error && (
              <div className="status success">
                <strong>{fActive.length}</strong> ativa(s) · <strong>{fRecent.length}</strong> concluída(s) recentemente em{' '}
                <strong>{selectedBairro.properties.NOME}</strong>
              </div>
            )}
          </div>

          {selectedBairro && (
            <div className="room-filter">
              <div className="room-filter-label">
                Filtrar por nº de quartos
                {roomsLoading && <span className="spinner" />}
              </div>
              <div className="room-chips">
                {ROOM_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    className={'room-chip' + (selectedRooms.includes(o.value) ? ' active' : '')}
                    onClick={() => toggleRoom(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {selectedRooms.length > 0 && (
                <div className="room-filter-hint">
                  Prédios sem dado de quartos ficam ocultos.
                </div>
              )}
            </div>
          )}

          <div className="legend">
            <div className="legend-item">
              <span className="legend-dot red" />
              <span>Em construção (ativa)</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot green" />
              <span>Concluída nos últimos 6 meses</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot blue" />
              <span>Concluída entre 6 e 24 meses</span>
            </div>
            <div className="legend-item">
              <span className="legend-poly" />
              <span>Limite do bairro</span>
            </div>
          </div>

          <div className="sidebar-footer">
            Fonte: <a href="https://bhmap.pbh.gov.br" target="_blank" rel="noreferrer">BHMap / PBH</a>
          </div>

          <button
            className="sidebar-collapse-btn"
            onClick={() => setExpanded(false)}
          >
            ▲ ocultar
          </button>
        </aside>
      )}

      <main className="map-container">
        {!expanded && (
          <div className="floating-search">
            <div className="floating-search-row">
              <div className="search-wrapper">
                <input
                  type="text"
                  className="search-input"
                  placeholder={bairrosLoading ? 'Carregando…' : 'Digite o bairro…'}
                  disabled={bairrosLoading}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <ul className="suggestions">
                    {suggestions.map(b => (
                      <li
                        key={b.properties.ID}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selectBairro(b)}
                      >
                        {b.properties.NOME}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                className="floating-expand-btn"
                onClick={() => setExpanded(true)}
                title="Abrir painel"
              >
                ≡
              </button>
            </div>
          </div>
        )}
        <MapView
          bairroFeature={selectedBairro}
          active={fActive}
          recentlyFinished={fRecent}
          olderFinished={fOlder}
          bbox={bbox}
        />
      </main>
    </div>
  )
}
