import { useState, useEffect } from 'react'
import MapView from './components/MapView'
import { fetchBairros, fetchProjectsByBbox } from './api/wfs'
import { normalize, getBbox, processFeatures } from './utils/geo'
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
  const [bbox, setBbox] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(true)

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
    setError(null)

    const bb = getBbox(bairro.geometry)
    setBbox(bb)

    setLoading(true)
    try {
      const features = await fetchProjectsByBbox(...bb)
      const { active, recentlyFinished } = processFeatures(features)
      setActive(active)
      setRecentlyFinished(recentlyFinished)
    } catch (err) {
      setError('Erro ao carregar projetos: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Construções em BH</h1>
          {expanded && (
            <p className="subtitle">
              Projetos de edificação residencial licenciados e ativos
            </p>
          )}
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

        {expanded && (
          <>
            <div className="status-area">
              {loading && (
                <div className="status">
                  <span className="spinner" /> Buscando construções…
                </div>
              )}
              {error && <div className="status error">{error}</div>}
              {!loading && selectedBairro && !error && (
                <div className="status success">
                  <strong>{active.length}</strong> ativa(s) · <strong>{recentlyFinished.length}</strong> concluída(s) recentemente em{' '}
                  <strong>{selectedBairro.properties.NOME}</strong>
                </div>
              )}
            </div>

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
                <span className="legend-poly" />
                <span>Limite do bairro</span>
              </div>
            </div>

            <div className="sidebar-footer">
              Fonte: <a href="https://bhmap.pbh.gov.br" target="_blank" rel="noreferrer">BHMap / PBH</a>
            </div>
          </>
        )}

        <button
          className="sidebar-collapse-btn"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? '▲ ocultar' : '▼ mostrar'}
        </button>
      </aside>

      <main className="map-container">
        <MapView
          bairroFeature={selectedBairro}
          active={active}
          recentlyFinished={recentlyFinished}
          bbox={bbox}
        />
      </main>
    </div>
  )
}
