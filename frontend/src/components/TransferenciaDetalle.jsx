import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import './../pages/transferencias.css';

function TransferenciaDetalle({ transferenciaId }) {
  const [detalles, setDetalles] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    if (transferenciaId) {
      api.get(`/transferencias/${transferenciaId}`)
        .then(res => {
          setDetalles(res.data);
          setFiltered(res.data);
        })
        .catch(err => console.error(err));
    }
  }, [transferenciaId]);

  const handleFilter = (e, key) => {
    const value = e.target.value.toLowerCase();
    setFiltered(
      detalles.filter(item =>
        String(item[key]).toLowerCase().includes(value)
      )
    );
    setCurrentPage(1);
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  if (!transferenciaId) return null;

  return (
    <div className="detalle-transferencia">
      <h3>Detalle de Transferencia #{transferenciaId}</h3>
      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>
              Código<br />
              <input type="text" onChange={e => handleFilter(e, 'cod_articulo')} placeholder="Filtrar" />
            </th>
            <th>
              Descripción<br />
              <input type="text" onChange={e => handleFilter(e, 'descripcion')} placeholder="Filtrar" />
            </th>
            <th>
              Cantidad<br />
              <input type="text" onChange={e => handleFilter(e, 'cantidad')} placeholder="Filtrar" />
            </th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((item, idx) => (
            <tr key={idx}>
              <td>{item.cod_articulo}</td>
              <td>{item.descripcion}</td>
              <td>{item.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>

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

import PropTypes from 'prop-types';

TransferenciaDetalle.propTypes = {
  transferenciaId: PropTypes.number.isRequired,
};


export default TransferenciaDetalle;
