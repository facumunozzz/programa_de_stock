import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from './components/Navbar';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

import Articulos from './pages/Articulos';
import Stock from './pages/Stock';
import Transferencias from './pages/Transferencias';
import Produccion from './pages/Produccion';
import Ajustes from './pages/Ajustes';
import Movimientos from './pages/Movimientos';
import NuevaTransferencia from './pages/NuevaTransferencia';
import NuevoAjuste from './pages/NuevoAjuste';

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/') {
      localStorage.setItem('ultimaRuta', location.pathname);
    }
  }, [location]);

  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Navigate to={localStorage.getItem('ultimaRuta') || '/stock'} />} />
          <Route path="/articulos" element={<Articulos />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/transferencias" element={<Transferencias />} />
          <Route path="/transferencias/nueva" element={<NuevaTransferencia />} />
          <Route path="/produccion" element={<Produccion />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="/ajustes/nuevo" element={<NuevoAjuste />} />
          <Route path="/movimientos" element={<Movimientos />} />
        </Routes>
      </div>
      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

