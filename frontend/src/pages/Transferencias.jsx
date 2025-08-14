import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import TransferenciaForm from '../components/TransferenciaForm';
import TransferenciaDetalle from '../components/TransferenciaDetalle';
import './transferencias.css';

function Transferencias() {
  const [transferencias, setTransferencias] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [detalleID, setDetalleID] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const fetchTransferencias = () => {
    api.get('/transferencias')
      .then(res => setTransferencias(res.data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchTransferencias();
  }, []);

  const transferenciasFiltradas = transferencias.filter(t =>
    Object.values(t).some(val => String(val).toLowerCase().includes(filtro.toLowerCase()))
  );

  return (
    <div className="transferencias-page">
      <h2>Transferencias</h2>
      <div className="acciones">
        <button onClick={() => setMostrarForm(true)}>Nueva transferencia</button>
        <input
          type="text"
          placeholder="Filtrar transferencias"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
      </div>

      {mostrarForm && (
        <TransferenciaForm onClose={() => {
          setMostrarForm(false);
          fetchTransferencias();
        }} />
      )}

      {detalleID && (
        <TransferenciaDetalle id={detalleID} onClose={() => setDetalleID(null)} />
      )}

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Nro Transferencia</th>
            <th>Ver Detalle</th>
          </tr>
        </thead>
        <tbody>
          {transferenciasFiltradas.map(t => (
            <tr key={t.id}>
              <td>{new Date(t.fecha).toLocaleString()}</td>
              <td>{t.origen}</td>
              <td>{t.destino}</td>
              <td>{t.numero_transferencia}</td>
              <td>
                <button onClick={() => setDetalleID(t.id)}>Ver</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Transferencias;
