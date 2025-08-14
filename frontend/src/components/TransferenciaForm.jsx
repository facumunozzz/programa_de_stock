import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import './../pages/transferencias.css';
import { toast } from 'react-toastify';

function TransferenciaForm({ onTransferenciaCreada }) {
  const [articulos, setArticulos] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [lineas, setLineas] = useState([{ cod_articulo: '', descripcion: '', cantidad: 1 }]);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');

  useEffect(() => {
    api.get('/articulos').then(res => setArticulos(res.data));
    api.get('/depositos').then(res => setDepositos(res.data));
  }, []);

  const handleCodigoChange = (index, value) => {
    const updated = [...lineas];
    updated[index].cod_articulo = value;
    const encontrado = articulos.find(a => a.cod_articulo === value);
    updated[index].descripcion = encontrado ? encontrado.descripcion : '';
    setLineas(updated);
  };

  const handleCantidadChange = (index, value) => {
    const updated = [...lineas];
    updated[index].cantidad = value;
    setLineas(updated);
  };

  const agregarLinea = () => {
    setLineas([...lineas, { cod_articulo: '', descripcion: '', cantidad: 1 }]);
  };

  const handleSubmit = async () => {
    if (!origen || !destino || origen === destino || lineas.some(l => !l.cod_articulo || l.cantidad <= 0)) {
      toast.error('Datos incompletos o incorrectos');
      return;
    }
    try {
      await api.post('/transferencias', {
        origen,
        destino,
        articulos: lineas
      });
      toast.success('Transferencia realizada con éxito');
      onTransferenciaCreada();
    } catch (err) {
      toast.error('Error al registrar la transferencia');
    }
  };

  return (
    <div className="formulario-transferencia">
      <h3>Nueva Transferencia</h3>
      <div className="selects">
        <select value={origen} onChange={e => setOrigen(e.target.value)}>
          <option value="">Origen</option>
          {depositos.map(d => <option key={d.nombre} value={d.nombre}>{d.nombre}</option>)}
        </select>
        <select value={destino} onChange={e => setDestino(e.target.value)}>
          <option value="">Destino</option>
          {depositos.filter(d => d.nombre !== origen).map(d => (
            <option key={d.nombre} value={d.nombre}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {lineas.map((linea, idx) => (
        <div className="linea-articulo" key={idx}>
          <input
            type="text"
            placeholder="Código"
            value={linea.cod_articulo}
            onChange={e => handleCodigoChange(idx, e.target.value)}
          />
          <input
            type="text"
            placeholder="Descripción"
            value={linea.descripcion}
            disabled
          />
          <input
            type="number"
            min={1}
            value={linea.cantidad}
            onChange={e => handleCantidadChange(idx, e.target.value)}
          />
        </div>
      ))}

      <div className="botones-form">
        <button onClick={agregarLinea}>+ Agregar Artículo</button>
        <button onClick={handleSubmit}>Transferir</button>
      </div>
    </div>
  );
}

export default TransferenciaForm;
