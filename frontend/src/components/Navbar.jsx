import React, { useCallback, useEffect, useMemo, useState } from "react";

import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

import logoSZ from "./../images/LOGO-SZCONSULTORES.png";
import logoAquatic from "./../images/logo-aquatic.png";

import "./../styles/navbar.css";

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();

  const { isAuth, isAdmin, hasUtilidad, displayName, logout } = useAuth();

  const [moduloActivo, setModuloActivo] = useState("stock");

  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  // =====================================================
  // CLASE DE LINKS
  // =====================================================

  const linkClass = ({ isActive }) =>
    isActive ? "navbar-link active" : "navbar-link";

  // =====================================================
  // PERMISOS GENERALES
  // =====================================================

  const puedeVerStock =
    isAdmin ||
    hasUtilidad("Artículos") ||
    hasUtilidad("Stock") ||
    hasUtilidad("Transferencias") ||
    hasUtilidad("Ajustes") ||
    hasUtilidad("Remitos") ||
    hasUtilidad("Movimientos");

  const puedeVerRecuento = isAdmin || hasUtilidad("RecuentoCiclico");

  const puedeVerProduccion =
    isAdmin ||
    hasUtilidad("Producción") ||
    hasUtilidad("Fábrica") ||
    hasUtilidad("PlanificacionProduccion");

  // =====================================================
  // OPCIONES DE CADA MÓDULO
  // =====================================================

  const obtenerOpcionesModulo = useCallback(
    (modulo) => {
      switch (modulo) {
        // =============================================
        // GESTIÓN DE STOCK
        // =============================================

        case "stock":
          return [
            {
              texto: "Artículos",
              ruta: "/articulos",
              visible: isAdmin || hasUtilidad("Artículos"),
            },
            {
              texto: "Stock",
              ruta: "/stock",
              visible: isAdmin || hasUtilidad("Stock"),
            },
            {
              texto: "Transferencias",
              ruta: "/transferencias",
              visible: isAdmin || hasUtilidad("Transferencias"),
            },
            {
              texto: "Altas y bajas / Ajustes",
              ruta: "/ajustes",
              visible: isAdmin || hasUtilidad("Ajustes"),
            },
            {
              texto: "Remitos",
              ruta: "/remitos",
              visible: isAdmin || hasUtilidad("Remitos"),
            },
            {
              texto: "Movimientos",
              ruta: "/movimientos",
              visible: isAdmin || hasUtilidad("Movimientos"),
            },
          ];

        // =============================================
        // RECUENTO CÍCLICO
        // =============================================

        case "recuento":
          return [
            {
              texto: "Base",
              ruta: "/recuento-ciclico/base",
              visible: puedeVerRecuento,
            },
            {
              texto: "Conteo",
              ruta: "/recuento-ciclico/conteo",
              visible: puedeVerRecuento,
            },
            {
              texto: "Transacciones",
              ruta: "/recuento-ciclico/transacciones",
              visible: puedeVerRecuento,
            },
            {
              texto: "Kaizen",
              ruta: "/recuento-ciclico/kaizen",
              visible: puedeVerRecuento,
            },
          ];

        // =============================================
        // PRODUCCIÓN
        // =============================================

        case "produccion":
          return [
            {
              texto: "Fórmulas de Producción",
              ruta: "/produccion",
              visible: isAdmin || hasUtilidad("Producción"),
            },
            {
              texto: "Fábrica",
              ruta: "/fabrica",
              visible: isAdmin || hasUtilidad("Fábrica"),
            },
          ];

        // =============================================
        // ADMINISTRACIÓN
        // =============================================

        case "administracion":
          return [
            {
              texto: "Administración",
              ruta: "/admin",
              visible: isAdmin,
            },
          ];

        default:
          return [];
      }
    },
    [hasUtilidad, isAdmin, puedeVerRecuento],
  );

  // =====================================================
  // OPCIONES DEL MÓDULO ACTIVO
  // =====================================================

  const opcionesModulo = useMemo(
    () => obtenerOpcionesModulo(moduloActivo),
    [moduloActivo, obtenerOpcionesModulo],
  );

  // =====================================================
  // DETECTAR MÓDULO SEGÚN URL
  // =====================================================

  useEffect(() => {
    const ruta = location.pathname;

    // -----------------------------------------
    // RECUENTO CÍCLICO
    // -----------------------------------------

    if (ruta.startsWith("/recuento-ciclico")) {
      setModuloActivo("recuento");
      return;
    }

    // -----------------------------------------
    // ADMINISTRACIÓN
    // -----------------------------------------

    if (ruta.startsWith("/admin")) {
      setModuloActivo("administracion");
      return;
    }

    // -----------------------------------------
    // PRODUCCIÓN
    // -----------------------------------------

    if (ruta.startsWith("/produccion") || ruta.startsWith("/fabrica")) {
      setModuloActivo("produccion");
      return;
    }

    // -----------------------------------------
    // STOCK
    // -----------------------------------------

    const rutasStock = [
      "/articulos",
      "/stock",
      "/transferencias",
      "/ajustes",
      "/remitos",
      "/movimientos",
    ];

    if (rutasStock.some((item) => ruta.startsWith(item))) {
      setModuloActivo("stock");
    }
  }, [location.pathname]);

  // =====================================================
  // CERRAR MENÚ MÓVIL AL CAMBIAR DE PANTALLA
  // =====================================================

  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [location.pathname]);

  // =====================================================
  // ESCAPE CIERRA MENÚ
  // =====================================================

  useEffect(() => {
    const cerrarConEscape = (event) => {
      if (event.key === "Escape") {
        setMenuMovilAbierto(false);
      }
    };

    window.addEventListener("keydown", cerrarConEscape);

    return () => {
      window.removeEventListener("keydown", cerrarConEscape);
    };
  }, []);

  // =====================================================
  // SELECCIONAR MÓDULO
  // =====================================================

  const seleccionarModulo = (modulo) => {
    setModuloActivo(modulo);
    setMenuMovilAbierto(false);

    const opciones = obtenerOpcionesModulo(modulo);

    const primeraOpcionVisible = opciones.find((opcion) => opcion.visible);

    if (primeraOpcionVisible) {
      navigate(primeraOpcionVisible.ruta);
    }
  };

  // =====================================================
  // LOGOUT
  // =====================================================

  const cerrarSesion = () => {
    setMenuMovilAbierto(false);
    logout();
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="navbar-layout">
      {/* ================================================= */}
      {/* BARRA LATERAL IZQUIERDA */}
      {/* ================================================= */}

      <aside className={`navbar-sidebar ${menuMovilAbierto ? "open" : ""}`}>
        <div className="navbar-sidebar-header">
          <img src={logoSZ} alt="SZ Consultores" className="logo-sz-sidebar" />

          <button
            type="button"
            className="navbar-sidebar-close"
            onClick={() => setMenuMovilAbierto(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* ============================================= */}
        {/* MÓDULOS */}
        {/* ============================================= */}

        <nav className="navbar-modulos" aria-label="Módulos principales">
          {/* GESTIÓN DE STOCK */}
          {puedeVerStock && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "stock" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("stock")}
            >
              Gestión de Stock
            </button>
          )}

          {/* RECUENTO CÍCLICO */}
          {puedeVerRecuento && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "recuento" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("recuento")}
            >
              Recuento Cíclico
            </button>
          )}

          {/* PRODUCCIÓN */}
          {puedeVerProduccion && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "produccion" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("produccion")}
            >
              Producción
            </button>
          )}

          {/* ADMINISTRACIÓN */}
          {isAdmin && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "administracion" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("administracion")}
            >
              Administración
            </button>
          )}
        </nav>
      </aside>

      {/* ================================================= */}
      {/* ÁREA PRINCIPAL */}
      {/* ================================================= */}

      <div className="navbar-main">
        {/* ================================================= */}
        {/* BARRA SUPERIOR */}
        {/* ================================================= */}

        <header className="navbar-top">
          {/* --------------------------------------------- */}
          {/* BOTÓN MOBILE */}
          {/* --------------------------------------------- */}

          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => setMenuMovilAbierto((estadoActual) => !estadoActual)}
            aria-label="Abrir menú"
            aria-expanded={menuMovilAbierto}
          >
            ☰
          </button>

          {/* --------------------------------------------- */}
          {/* LOGO SZ */}
          {/* --------------------------------------------- */}

          <img src={logoSZ} alt="SZ Consultores" className="logo-sz-top" />

          {/* ============================================= */}
          {/* OPCIONES DEL MÓDULO ACTIVO */}
          {/* ============================================= */}

          <nav className="navbar-options" aria-label="Opciones del módulo">
            {opcionesModulo
              .filter((opcion) => opcion.visible)
              .map((opcion) => (
                <NavLink
                  key={opcion.ruta}
                  to={opcion.ruta}
                  end={opcion.ruta === "/produccion"}
                  className={linkClass}
                >
                  {opcion.texto}
                </NavLink>
              ))}
          </nav>

          {/* ============================================= */}
          {/* USUARIO + LOGO AQUATIC */}
          {/* ============================================= */}

          <div className="navbar-user-area">
            {isAuth ? (
              <>
                <span className="navbar-user" title={displayName}>
                  {displayName}
                </span>

                <button
                  type="button"
                  className="navbar-logout"
                  onClick={cerrarSesion}
                >
                  Salir
                </button>
              </>
            ) : (
              <NavLink to="/login" className="navbar-login">
                Iniciar sesión
              </NavLink>
            )}

            <img src={logoAquatic} alt="Aquatic" className="logo-aquatic" />
          </div>
        </header>
      </div>

      {/* ================================================= */}
      {/* OVERLAY MOBILE */}
      {/* ================================================= */}

      {menuMovilAbierto && (
        <button
          type="button"
          className="navbar-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMenuMovilAbierto(false)}
        />
      )}
    </div>
  );
}

export default Navbar;
