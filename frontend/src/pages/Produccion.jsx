import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import './../styles/articulos.css'; // reutilizamos estilos de tablas y títulos

export default function Produccion() {
  const navigate = useNavigate();

  // Artículos
  const [articulos, setArticulos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Filtros por columna (como en Artículos)
  const [filtros, setFiltros] = useState({
    cod_articulo: '', descripcion: '', cod_modelo: '', color: '', talle: '',
    cod_barra: '', tipo: '', familia: '', subfamilia: '', material: '',
    iibb_aplica: '', lista_precios_aplica: ''
  });

  // Fórmula seleccionada
  const [seleccion, setSeleccion] = useState(null);
  const [formula, setFormula] = useState([]);        // [{cod_articulo, descripcion, cantidad}]
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [errorFormula, setErrorFormula] = useState('');

  useEffect(() => {
    api.get('/articulos')
      .then(res => {
        setArticulos(res.data || []);
        setFiltered(res.data || []);
      })
      .catch(err => console.error(err));
  }, []);

  const onFilterChange = (key, val) => {
    const nf = { ...filtros, [key]: (val ?? '').toLowerCase() };
    setFiltros(nf);
    const f = (articulos || []).filter(a =>
      Object.keys(nf).every(k =>
        String(a[k] ?? '').toLowerCase().includes(nf[k])
      )
    );
    setFiltered(f);
    setCurrentPage(1);
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil((filtered.length || 0) / itemsPerPage);

  const verFormula = async (art) => {
    setSeleccion({ cod_articulo: art.cod_articulo, descripcion: art.descripcion });
    setLoadingFormula(true);
    setErrorFormula('');
    setFormula([]);
    try {
      // ✅ URL y shape correctos del backend
      const res = await api.get(`/produccion/formulas/${encodeURIComponent(art.cod_articulo)}`);

      // El backend devuelve { producto, detalle: [...] }
      const detalle = Array.isArray(res.data?.detalle) ? res.data.detalle : [];
      setFormula(detalle);
      setErrorFormula(detalle.length === 0 ? 'No existe fórmula para este código' : '');
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Error al obtener la fórmula';
      setErrorFormula(msg);
    } finally {
      setLoadingFormula(false);
    }
  };

  return (
    <div className="articulos-container">
      <h2 className="module-title">Fórmulas de Producción</h2>

      <div className="acciones" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/produccion/crear')}>Crear fórmula</button>
        <button onClick={() => navigate('/produccion/editar')}>Editar fórmula</button>
      </div>

      {/* Tabla de artículos (misma info que en Artículos) */}
      <div className="tabla-articulos-container">
        <table className="tabla-articulos">
          <thead>
            <tr>
              <th>
                Código<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('cod_articulo', e.target.value)} />
              </th>
              <th>
                Descripción<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('descripcion', e.target.value)} />
              </th>
              <th>
                Cod. Modelo<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('cod_modelo', e.target.value)} />
              </th>
              <th>
                Color<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('color', e.target.value)} />
              </th>
              <th>
                Talle<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('talle', e.target.value)} />
              </th>
              <th>
                Cod. Barra<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('cod_barra', e.target.value)} />
              </th>
              <th>
                Tipo<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('tipo', e.target.value)} />
              </th>
              <th>
                Familia<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('familia', e.target.value)} />
              </th>
              <th>
                Subfamilia<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('subfamilia', e.target.value)} />
              </th>
              <th>
                Material<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('material', e.target.value)} />
              </th>
              <th>
                IIBB Aplica<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('iibb_aplica', e.target.value)} />
              </th>
              <th>
                Lista Precios Aplica<br />
                <input placeholder="Filtrar" onChange={e => onFilterChange('lista_precios_aplica', e.target.value)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={12}>Sin artículos.</td></tr>
            ) : paginated.map((a, idx) => (
              <tr
                key={idx}
                style={{ cursor: 'pointer' }}
                title="Ver fórmula"
                onClick={() => verFormula(a)}
              >
                <td>{a.cod_articulo}</td>
                <td>{a.descripcion}</td>
                <td>{a.cod_modelo ?? ''}</td>
                <td>{a.color ?? ''}</td>
                <td>{a.talle ?? ''}</td>
                <td>{a.cod_barra ?? ''}</td>
                <td>{a.tipo ?? ''}</td>
                <td>{a.familia ?? ''}</td>
                <td>{a.subfamilia ?? ''}</td>
                <td>{a.material ?? ''}</td>
                <td>{a.iibb_aplica ?? ''}</td>
                <td>{a.lista_precios_aplica ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación artículos */}
      <div className="paginado">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            className={currentPage === i + 1 ? 'activo' : ''}
            onClick={() => setCurrentPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Panel de fórmula */}
      <div className="nt-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>
          {seleccion
            ? `Fórmula para ${seleccion.cod_articulo} — ${seleccion.descripcion}`
            : 'Seleccioná un artículo para ver su fórmula'}
        </h3>

        {loadingFormula && <div>Cargando fórmula…</div>}
        {!loadingFormula && seleccion && (
          <>
            {errorFormula ? (
              <div className="nt-error">{errorFormula}</div>
            ) : (
              <div className="tabla-articulos-container">
                <table className="tabla-articulos">
                  <thead>
                    <tr>
                      <th>Componente (Código)</th>
                      <th>Descripción</th>
                      <th style={{ textAlign: 'right' }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formula.length === 0 ? (
                      <tr><td colSpan={3}>No existe fórmula para este código</td></tr>
                    ) : (
                      formula.map((c, i) => (
                        <tr key={i}>
                          <td>{c.cod_articulo}</td>
                          <td>{c.descripcion ?? ''}</td>
                          <td style={{ textAlign: 'right' }}>{c.cantidad}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
