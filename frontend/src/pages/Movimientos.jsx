import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import * as XLSX from 'xlsx';                // ⬅️ agregado
import './../styles/transferencias.css'; // reutilizo estilos de tablas

function Movimientos() {
  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const [filtros, setFiltros] = useState({
    fecha: '',
    codigo: '',
    descripcion: '',
    cantidad: '',
    deposito: '',
    usuario: '',
    movimiento: '',
    num_movimiento: '',
  });

  useEffect(() => {
    api.get('/movimientos')
      .then(res => {
        setRows(res.data || []);
        setFiltered(res.data || []);
      })
      .catch(err => console.error(err));
  }, []);

  const onFilterChange = (key, val) => {
    const value = (val ?? '').toLowerCase();
    const nf = { ...filtros, [key]: value };
    setFiltros(nf);

    const f = (rows || []).filter(r => {
      const v = {
        fecha: r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : '',
        codigo: r.codigo ?? '',
        descripcion: r.descripcion ?? '',
        cantidad: String(r.cantidad ?? ''),
        deposito: r.deposito ?? '',
        usuario: r.usuario ?? '',
        movimiento: r.movimiento ?? '',
        num_movimiento: r.num_movimiento ?? '',
      };
      return Object.keys(nf).every(k =>
        String(v[k]).toLowerCase().includes(nf[k])
      );
    });

    setFiltered(f);
    setCurrentPage(1);
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil((filtered.length || 0) / itemsPerPage);

  // ===== Exportar a Excel =====
  const exportarExcel = () => {
    // Exporta lo filtrado; si no hay filtros, exporta todo
    const data = (filtered.length ? filtered : rows).map(r => ({
      Fecha: r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : '',
      Código: r.codigo ?? '',
      Descripción: r.descripcion ?? '',
      Cantidad: r.cantidad ?? '',
      Depósito: r.deposito ?? '',
      Usuario: r.usuario ?? '',
      Movimiento: r.movimiento ?? '',
      'Num. Movimiento': r.num_movimiento ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, 'movimientos.xlsx');
  };

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Movimientos</h2>

      {/* Botón Exportar */}
      <div className="acciones" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={exportarExcel}>Exportar a Excel</button>
      </div>

      <div className="tabla-articulos-container">
        <table className="tabla-movimientos">
          <thead>
            <tr>
              <th>
                Fecha<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('fecha', e.target.value)}
                />
              </th>
              <th>
                Código<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('codigo', e.target.value)}
                />
              </th>
              <th>
                Descripción<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('descripcion', e.target.value)}
                />
              </th>
              <th style={{ textAlign: 'right' }}>
                Cantidad<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('cantidad', e.target.value)}
                />
              </th>
              <th>
                Depósito<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('deposito', e.target.value)}
                />
              </th>
              <th>
                Usuario<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('usuario', e.target.value)}
                />
              </th>
              <th>
                Movimiento<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('movimiento', e.target.value)}
                />
              </th>
              <th>
                Num. Movimiento<br />
                <input
                  type="text"
                  placeholder="Filtrar"
                  onChange={e => onFilterChange('num_movimiento', e.target.value)}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={8}>Sin movimientos.</td></tr>
            ) : paginated.map((r, i) => (
              <tr key={i}>
                <td>{r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : ''}</td>
                <td>{r.codigo}</td>
                <td>{r.descripcion}</td>
                <td style={{ textAlign: 'right' }}>{r.cantidad}</td>
                <td>{r.deposito}</td>
                <td>{r.usuario ?? ''}</td>
                <td>{r.movimiento}</td>
                <td>{r.num_movimiento}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}

export default Movimientos;
