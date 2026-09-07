import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Icon, { GoogleIcon } from "./icons.jsx";
import { interpretarConGemini } from "./gemini.js";
import { supabase } from "./supabaseClient.js";
import logoUrl from "./assets/logo.png";

const STOCK_MINIMO = 30;
const DIAS_ALERTA_VENCIMIENTO = 15;
const FORMAS_PAGO = ["Efectivo", "Nequi", "Transferencia", "Tarjeta", "Crédito"];
const GASTOS_CATALOGO = ["Agua", "Luz", "Internet", "Nómina", "Seguridad social", "Arriendo", "Útiles de aseo", "Vigilancia"];
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ---------- utilidades ----------
const money = (n) => "$" + Math.round(n || 0).toLocaleString("es-CO");

function normalizar(txt) {
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function extraerNumeros(texto) {
  const matches = texto.match(/\d[\d.,]*/g) || [];
  return matches.map((m) => parseInt(m.replace(/[.,]/g, ""), 10)).filter((n) => !isNaN(n));
}
function detectarFormaPago(texto) {
  const t = normalizar(texto);
  if (t.includes("credito")) return "Crédito";
  if (t.includes("nequi")) return "Nequi";
  if (t.includes("transferencia")) return "Transferencia";
  if (t.includes("tarjeta")) return "Tarjeta";
  if (t.includes("efectivo")) return "Efectivo";
  return null;
}
function detectarProducto(texto, productos) {
  const t = normalizar(texto);
  let mejor = null;
  for (const p of productos) {
    const claves = normalizar(p.nombre).split(" ").filter((w) => w.length > 3);
    for (const clave of claves) { if (t.includes(clave)) { mejor = p; break; } }
    if (mejor) break;
  }
  return mejor;
}
function detectarGasto(texto) {
  const t = normalizar(texto);
  return GASTOS_CATALOGO.find((g) => t.includes(normalizar(g).split(" ")[0])) || null;
}
function diasParaVencer(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fechaStr + "T00:00:00");
  return Math.round((f - hoy) / (1000 * 60 * 60 * 24));
}
function agruparUltimosDias(items, montoFn, dias = 7) {
  const hoy = new Date();
  const resultado = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy); d.setDate(d.getDate() - i);
    const clave = d.toISOString().slice(0, 10);
    const total = items.filter((it) => it.fecha && it.fecha.slice(0, 10) === clave).reduce((s, it) => s + montoFn(it), 0);
    resultado.push({ label: DIAS_SEMANA[d.getDay()], total });
  }
  return resultado;
}
function dentroDePeriodo(fechaStr, periodo) {
  if (!fechaStr) return false;
  const f = new Date(fechaStr);
  const hoy = new Date();
  if (periodo === "dia") return f.toDateString() === hoy.toDateString();
  if (periodo === "semana") { const diffDias = (hoy - f) / (1000 * 60 * 60 * 24); return diffDias >= 0 && diffDias < 7; }
  if (periodo === "mes") return f.getFullYear() === hoy.getFullYear() && f.getMonth() === hoy.getMonth();
  return true;
}
function saludoPorHora() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días — hora de contar los granos";
  if (h < 19) return "Buenas tardes — ¿cómo va la tienda hoy?";
  return "Buenas noches — cerrando con buen aroma";
}

// ---------- Reporte por período, reutilizable dentro de cada módulo ----------
function usePeriodoReporte(items, montoFn) {
  const [periodo, setPeriodo] = useState("dia");
  const filtrados = useMemo(() => items.filter((it) => dentroDePeriodo(it.fecha, periodo)), [items, periodo]);
  const total = useMemo(() => filtrados.reduce((s, it) => s + montoFn(it), 0), [filtrados, montoFn]);
  return { periodo, setPeriodo, filtrados, total };
}

const PERIODOS = [{ id: "dia", label: "Día" }, { id: "semana", label: "Semana" }, { id: "mes", label: "Mes" }];

function TabsPeriodo({ periodo, setPeriodo }) {
  return (
    <div className="period-tabs">
      {PERIODOS.map((p) => (
        <button key={p.id} type="button" className={`period-tab ${periodo === p.id ? "active" : ""}`} onClick={() => setPeriodo(p.id)}>{p.label}</button>
      ))}
    </div>
  );
}

// ---------- Reconocimiento de voz ----------
function useVoz(onTexto) {
  const [escuchando, setEscuchando] = useState(false);
  const [soportado] = useState(() => typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition));
  const recRef = useRef(null);
  const iniciar = useCallback(() => {
    if (!soportado) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "es-CO";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onTexto(e.results[0][0].transcript);
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    recRef.current = rec;
    setEscuchando(true);
    rec.start();
  }, [soportado, onTexto]);
  return { escuchando, soportado, iniciar };
}

// ---------- Asistente de voz (barra oscura, real: STT navegador + Gemini) ----------
function AsistenteVoz({ placeholder, onTexto }) {
  const [fase, setFase] = useState("idle"); // idle | procesando | resultado
  const [mensaje, setMensaje] = useState(placeholder);

  const { escuchando, soportado, iniciar } = useVoz(async (texto) => {
    setFase("procesando");
    const resultado = await onTexto(texto);
    setMensaje(resultado || "Listo");
    setFase("resultado");
    setTimeout(() => { setFase("idle"); setMensaje(placeholder); }, 2400);
  });

  const activo = escuchando || fase === "procesando";
  const eyebrow = escuchando ? "Escuchando…" : fase === "procesando" ? "Analizando con IA…" : fase === "resultado" ? "Listo" : "Asistente de voz";
  const texto = escuchando ? "Habla ahora" : fase === "procesando" ? "Un momento…" : mensaje;

  return (
    <div>
      <button
        type="button"
        className={`assistant ${activo ? "listening" : ""} ${fase === "resultado" ? "result" : ""}`}
        onClick={iniciar}
        disabled={!soportado || fase === "procesando"}
      >
        <div className="assistant-mic"><Icon name="mic" size={20} color={activo ? "#F7EEDF" : "#2A1810"} /></div>
        <div className="assistant-body">
          <p className="assistant-eyebrow">{eyebrow}</p>
          <p className="assistant-text">{texto}</p>
        </div>
        <div className="waveform"><span></span><span></span><span></span><span></span><span></span></div>
        <div className="assistant-result-icon"><Icon name="check" size={12} color="#F7EEDF" /></div>
      </button>
      {!soportado && <p style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--cherry)" }}>Este navegador no soporta dictado por voz — usa el formulario manual de abajo.</p>}
    </div>
  );
}

function Campo({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

// ---------- Login (tabs, registro real, Google OAuth, animación de café) ----------
function Login() {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [overlay, setOverlay] = useState({ active: false, text: "" });

  const mostrarOverlay = (texto) => setOverlay({ active: true, text: texto });
  const actualizarOverlay = (texto) => setOverlay((o) => ({ ...o, text: texto }));
  const ocultarOverlay = () => setOverlay({ active: false, text: "" });

  const entrar = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    mostrarOverlay("Preparando tu café…");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) { ocultarOverlay(); setError("Correo o contraseña incorrectos."); return; }
    actualizarOverlay("¡Listo! Bienvenido de nuevo.");
    setTimeout(ocultarOverlay, 900);
  };

  const registrar = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    mostrarOverlay("Preparando tu cuenta…");
    const { data, error } = await supabase.auth.signUp({
      email: regEmail, password: regPassword, options: { data: { nombre: nombre || regEmail } },
    });
    setCargando(false);
    if (error) {
      ocultarOverlay();
      setError(error.message?.includes("already registered") ? "Ese correo ya tiene una cuenta." : "No se pudo crear la cuenta.");
      return;
    }
    if (data.session) {
      actualizarOverlay("¡Cuenta creada! Bienvenido al equipo.");
      setTimeout(ocultarOverlay, 1100);
    } else {
      ocultarOverlay();
      setError("¡Cuenta creada! Revisa tu correo para confirmarla antes de iniciar sesión.");
      setTab("login");
    }
  };

  const conGoogle = async () => {
    setError("");
    mostrarOverlay("Conectando con Google…");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) { ocultarOverlay(); setError("No se pudo conectar con Google. Verifica que el proveedor esté configurado en Supabase."); }
  };

  return (
    <div className="login-stage">
      <div className="login-wrap">
        <div className="brand-panel">
          <div>
            <img src={logoUrl} alt="" className="badge" />
            <h1 className="brand-name font-titulo">Café Tierra<br />Querida</h1>
            <p className="brand-slogan font-titulo">"El dulce sabor de nuestra tierra"</p>
          </div>
          <div className="brand-bottom">
            <strong>Portal de equipo</strong><br />
            Acceso para colaboradores de la tienda.
          </div>
        </div>

        <div className="form-panel">
          <div className="form-inner">
            <div className="tabs">
              <button type="button" className={`tab-btn ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setError(""); }}>Iniciar sesión</button>
              <button type="button" className={`tab-btn ${tab === "register" ? "active" : ""}`} onClick={() => { setTab("register"); setError(""); }}>Registrarse</button>
            </div>

            {tab === "login" ? (
              <>
                <p className="form-eyebrow">Bienvenido de nuevo</p>
                <h2 className="form-title font-titulo">Inicia sesión para continuar</h2>
                <form onSubmit={entrar}>
                  <Campo label="Correo"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Campo>
                  <Campo label="Contraseña"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></Campo>
                  {error && <p className="login-error">{error}</p>}
                  <button className="submit-btn" type="submit" disabled={cargando}>Entrar</button>
                </form>
                <div className="divider"><span>o</span></div>
                <button type="button" className="google-btn" onClick={conGoogle} disabled={cargando}><GoogleIcon /> Continuar con Google</button>
                <p className="switch-text">¿Eres empleado nuevo? <a onClick={() => setTab("register")}>Regístrate aquí</a></p>
              </>
            ) : (
              <>
                <p className="form-eyebrow">Únete al equipo</p>
                <h2 className="form-title font-titulo">Crea tu cuenta</h2>
                <form onSubmit={registrar}>
                  <Campo label="Nombre completo"><input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></Campo>
                  <Campo label="Correo"><input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required autoComplete="email" /></Campo>
                  <Campo label="Contraseña"><input type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required minLength={6} autoComplete="new-password" /></Campo>
                  {error && <p className="login-error">{error}</p>}
                  <button className="submit-btn" type="submit" disabled={cargando}>Crear cuenta</button>
                </form>
                <div className="divider"><span>o</span></div>
                <button type="button" className="google-btn" onClick={conGoogle} disabled={cargando}><GoogleIcon /> Continuar con Google</button>
                <p className="switch-text">¿Ya tienes cuenta? <a onClick={() => setTab("login")}>Inicia sesión</a></p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={`loading-overlay ${overlay.active ? "active" : ""}`}>
        <svg viewBox="0 0 104 104" width="88" height="88">
          <path className="steam-line s1" d="M40 26 Q36 18 41 10" />
          <path className="steam-line s2" d="M52 26 Q48 18 53 10" />
          <path className="steam-line s3" d="M64 26 Q60 18 65 10" />
          <defs><clipPath id="cupClip"><path d="M26 34 H70 L65 82 Q64 92 52 92 H44 Q32 92 31 82 Z" /></clipPath></defs>
          <path d="M26 34 H70 L65 82 Q64 92 52 92 H44 Q32 92 31 82 Z" fill="none" stroke="#F7EEDF" strokeWidth="3.5" />
          <path d="M70 40 Q88 40 88 55 Q88 70 70 68" fill="none" stroke="#F7EEDF" strokeWidth="3.5" />
          <g clipPath="url(#cupClip)"><rect className="coffee-fill" x="24" y="34" width="52" height="60" fill="#C6862F" /></g>
        </svg>
        <p className="loading-text">{overlay.text}</p>
      </div>
    </div>
  );
}

// ---------- App ----------
function App() {
  const [session, setSession] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [perfil, setPerfil] = useState(null);

  const [pantalla, setPantalla] = useState("inicio");
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [toast, setToast] = useState(null);

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setCargandoSesion(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  const cargarTodo = useCallback(async () => {
    const [{ data: prod }, { data: vt }, { data: cp }, { data: gs }] = await Promise.all([
      supabase.from("productos").select("*").order("id"),
      supabase.from("ventas").select("*").order("creado_en", { ascending: false }),
      supabase.from("compras").select("*").order("creado_en", { ascending: false }),
      supabase.from("gastos").select("*").order("creado_en", { ascending: false }),
    ]);
    setProductos((prod || []).map((p) => ({ id: Number(p.id), nombre: p.nombre, stock: p.stock, costoProm: Number(p.costo_prom), precioVenta: Number(p.precio_venta), fechaVencimiento: p.fecha_vencimiento })));
    setVentas((vt || []).map((v) => ({ id: Number(v.id), productoId: Number(v.producto_id), cantidad: v.cantidad, precio: Number(v.precio), formaPago: v.forma_pago, costoUnit: Number(v.costo_unit), saldo: Number(v.saldo), fecha: v.creado_en })));
    setCompras((cp || []).map((c) => ({ id: Number(c.id), productoId: Number(c.producto_id), cantidad: c.cantidad, precio: Number(c.precio), formaPago: c.forma_pago, saldo: Number(c.saldo), fecha: c.creado_en })));
    setGastos((gs || []).map((g) => ({ id: Number(g.id), descripcion: g.descripcion, valor: Number(g.valor), formaPago: g.forma_pago, pagado: g.pagado, fecha: g.creado_en })));
  }, []);

  useEffect(() => {
    if (!session) { setPerfil(null); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("nombre").eq("id", session.user.id).single();
      setPerfil(data || { nombre: session.user.email });
      await cargarTodo();
    })();
  }, [session, cargarTodo]);

  // Cálculos derivados — SIEMPRE antes de cualquier return condicional (regla de los Hooks)
  const reportes = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + v.cantidad * v.precio, 0);
    const totalCosto = ventas.reduce((s, v) => s + v.cantidad * v.costoUnit, 0);
    const totalGastos = gastos.reduce((s, g) => s + g.valor, 0);
    const utilidad = totalVentas - totalCosto - totalGastos;
    const cuentasPorCobrar = ventas.filter((v) => v.saldo > 0);
    const cuentasPorPagar = [
      ...compras.filter((c) => c.saldo > 0).map((c) => ({ ...c, tipo: "Compra" })),
      ...gastos.filter((g) => !g.pagado).map((g) => ({ ...g, tipo: "Gasto", saldo: g.valor })),
    ];
    const semana = {
      ventas: agruparUltimosDias(ventas, (v) => v.cantidad * v.precio),
      compras: agruparUltimosDias(compras, (c) => c.cantidad * c.precio),
      gastos: agruparUltimosDias(gastos, (g) => g.valor),
    };
    return { totalVentas, totalCosto, totalGastos, utilidad, cuentasPorCobrar, cuentasPorPagar, semana };
  }, [ventas, compras, gastos]);

  const stockBajo = productos.filter((p) => p.stock < STOCK_MINIMO);

  if (cargandoSesion) return <div className="login-stage" style={{ alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--cream)" }}>Cargando…</p></div>;
  if (!session) return <Login />;
  if (!perfil) return <div className="login-stage" style={{ alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--cream)" }}>Cargando tu perfil…</p></div>;

  const registrarVenta = async ({ productoId, cantidad, precio, formaPago }) => {
    const prod = productos.find((p) => p.id === Number(productoId));
    if (!prod) return mostrarToast("Selecciona un producto válido", "error");
    if (cantidad <= 0 || precio <= 0) return mostrarToast("Cantidad y precio deben ser mayores a 0", "error");
    if (prod.stock < cantidad) return mostrarToast(`Stock insuficiente de ${prod.nombre} (disponible: ${prod.stock})`, "error");
    const { error } = await supabase.from("ventas").insert({
      producto_id: prod.id, cantidad, precio, forma_pago: formaPago, costo_unit: prod.costoProm,
      saldo: formaPago === "Crédito" ? cantidad * precio : 0, creado_por: session.user.id,
    });
    if (error) return mostrarToast("No se pudo guardar la venta", "error");
    await cargarTodo();
    mostrarToast(`Venta registrada: ${cantidad} × ${prod.nombre}`);
  };

  const registrarCompra = async ({ productoId, cantidad, precio, formaPago, fechaVencimiento }) => {
    const prod = productos.find((p) => p.id === Number(productoId));
    if (!prod) return mostrarToast("Selecciona un producto válido", "error");
    if (cantidad <= 0 || precio <= 0) return mostrarToast("Cantidad y precio deben ser mayores a 0", "error");
    const { error } = await supabase.from("compras").insert({
      producto_id: prod.id, cantidad, precio, forma_pago: formaPago,
      saldo: formaPago === "Crédito" ? cantidad * precio : 0, creado_por: session.user.id,
      fecha_vencimiento: fechaVencimiento || null,
    });
    if (error) return mostrarToast("No se pudo guardar la compra", "error");
    await cargarTodo();
    mostrarToast(`Compra registrada: ${cantidad} × ${prod.nombre}`);
  };

  const registrarGasto = async ({ descripcion, valor, formaPago }) => {
    if (!descripcion) return mostrarToast("Escribe una descripción", "error");
    if (valor <= 0) return mostrarToast("El valor debe ser mayor a 0", "error");
    const { error } = await supabase.from("gastos").insert({ descripcion, valor, forma_pago: formaPago, pagado: formaPago !== "Crédito", creado_por: session.user.id });
    if (error) return mostrarToast("No se pudo guardar el gasto", "error");
    await cargarTodo();
    mostrarToast(`Gasto registrado: ${descripcion}`);
  };

  const pagarGasto = async (id) => { await supabase.from("gastos").update({ pagado: true }).eq("id", id); await cargarTodo(); };
  const abonarVenta = async (id, monto) => {
    const venta = ventas.find((v) => v.id === id);
    if (!venta) return;
    const nuevoSaldo = Math.max(0, venta.saldo - (Number(monto) || 0));
    const { error } = await supabase.from("ventas").update({ saldo: nuevoSaldo }).eq("id", id);
    if (error) return mostrarToast("No se pudo registrar el abono", "error");
    await cargarTodo();
    mostrarToast(`Abono registrado: ${money(monto)}${nuevoSaldo > 0 ? ` · Saldo restante: ${money(nuevoSaldo)}` : " · Saldado por completo"}`);
  };
  const pagarCompra = async (id, monto) => {
    const compra = compras.find((c) => c.id === id);
    if (!compra) return;
    const nuevoSaldo = Math.max(0, compra.saldo - (Number(monto) || 0));
    const { error } = await supabase.from("compras").update({ saldo: nuevoSaldo }).eq("id", id);
    if (error) return mostrarToast("No se pudo registrar el pago", "error");
    await cargarTodo();
    mostrarToast(`Pago registrado: ${money(monto)}${nuevoSaldo > 0 ? ` · Saldo restante: ${money(nuevoSaldo)}` : " · Saldado por completo"}`);
  };
  const eliminarGasto = async (id) => { await supabase.from("gastos").delete().eq("id", id); await cargarTodo(); };
  const cerrarSesion = async () => { await supabase.auth.signOut(); };

  const agregarProducto = async ({ nombre, stock, costoProm, precioVenta, fechaVencimiento }) => {
    if (!nombre) { mostrarToast("Escribe un nombre de producto", "error"); return null; }
    const { data, error } = await supabase.from("productos").insert({
      nombre, stock: Number(stock) || 0, costo_prom: Number(costoProm) || 0, precio_venta: Number(precioVenta) || 0, fecha_vencimiento: fechaVencimiento || null,
    }).select().single();
    if (error) { mostrarToast("No se pudo agregar el producto", "error"); return null; }
    await cargarTodo();
    mostrarToast(`Producto agregado: ${nombre}`);
    return Number(data.id);
  };

  const ajustarStock = async (productoId, delta, fechaVencimiento) => {
    const prod = productos.find((p) => p.id === Number(productoId));
    if (!prod) return mostrarToast("Selecciona un producto válido", "error");
    if (!delta && !fechaVencimiento) return mostrarToast("Ingresa una cantidad o una fecha de vencimiento", "error");
    const nuevoStock = Math.max(0, prod.stock + (delta || 0));
    const cambios = { stock: nuevoStock };
    if (fechaVencimiento) cambios.fecha_vencimiento = fechaVencimiento;
    const { error } = await supabase.from("productos").update(cambios).eq("id", prod.id);
    if (error) return mostrarToast("No se pudo ajustar el producto", "error");
    await cargarTodo();
    mostrarToast(`${prod.nombre} actualizado.`);
  };

  return (
    <div className="phone">
      <Header pantalla={pantalla} onLogout={cerrarSesion} />
      <main className="content">
        {pantalla === "inicio" && <Inicio productos={productos} stockBajo={stockBajo} ir={setPantalla} perfil={perfil} />}
        {pantalla === "ingresos" && <Ingresos productos={productos} ventas={ventas} onRegistrar={registrarVenta} />}
        {pantalla === "compras" && <Compras productos={productos} compras={compras} onRegistrar={registrarCompra} onAgregarProducto={agregarProducto} />}
        {pantalla === "gastos" && <Gastos gastos={gastos} onRegistrar={registrarGasto} onPagar={pagarGasto} onEliminar={eliminarGasto} />}
        {pantalla === "inventario" && <Inventario productos={productos} onAgregarProducto={agregarProducto} onAjustarStock={ajustarStock} />}
        {pantalla === "reportes" && <Reportes reportes={reportes} productos={productos} ventas={ventas} compras={compras} gastos={gastos} onAbonarVenta={abonarVenta} onPagarCompra={pagarCompra} />}
      </main>
      <NavInferior pantalla={pantalla} ir={setPantalla} alertas={stockBajo.length} />
      {toast && (
        <div className="toast-anim" style={{ position: "absolute", bottom: 88, left: "50%", transform: "translateX(-50%)", maxWidth: "90%", padding: "10px 16px", borderRadius: 10, color: "#fff", fontSize: "0.85rem", zIndex: 40, background: toast.tipo === "error" ? "var(--cherry)" : "var(--pine)" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const TITULOS = { inicio: "Panel principal", ingresos: "Ingresos", compras: "Compras", gastos: "Gastos", inventario: "Inventario", reportes: "Reportes" };

function Header({ pantalla, onLogout }) {
  return (
    <div className="header">
      <img className="badge" src={logoUrl} alt="Café Tierra Querida" />
      <div className="titles">
        <p className="brand font-titulo">Café Tierra Querida</p>
        <p className="sub">{TITULOS[pantalla]}</p>
      </div>
      <button className="logout-btn" onClick={onLogout} aria-label="Cerrar sesión">
        <Icon name="logout" size={18} color="var(--espresso-700)" />
      </button>
    </div>
  );
}

function NavInferior({ pantalla, ir, alertas }) {
  const items = [
    { id: "inicio", icon: "home", label: "Inicio" },
    { id: "ingresos", icon: "arrowDown", label: "Ingresos" },
    { id: "compras", icon: "cart", label: "Compras", extra: true },
    { id: "gastos", icon: "receipt", label: "Gastos", extra: true },
    { id: "inventario", icon: "package", label: "Inventario", badge: alertas },
    { id: "reportes", icon: "bars", label: "Reportes" },
  ];
  return (
    <div className="bottom-nav">
      {items.map((it) => {
        const activo = pantalla === it.id;
        return (
          <button key={it.id} type="button" className={`nav-btn ${activo ? "active" : ""} ${it.extra ? "nav-extra" : ""}`} onClick={() => ir(it.id)}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon name={it.icon} size={20} color={activo ? "var(--espresso-900)" : "var(--espresso-600)"} />
              {it.badge > 0 && <span style={{ position: "absolute", top: -5, right: -7, width: 15, height: 15, borderRadius: "50%", background: "var(--cherry)", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{it.badge}</span>}
            </span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Inicio({ productos, stockBajo, ir, perfil }) {
  const totalStock = productos.reduce((s, p) => s + p.stock, 0);
  const tiles = [
    { id: "ingresos", label: "Ingresos", icon: "arrowDown", clase: "ingresos" },
    { id: "compras", label: "Compras", icon: "cart", clase: "compras" },
    { id: "gastos", label: "Gastos", icon: "receipt", clase: "gastos" },
    { id: "inventario", label: "Inventario", icon: "package", clase: "inventario" },
    { id: "reportes", label: "Reportes", icon: "bars", clase: "reportes" },
  ];

  const procesarConsulta = async (texto) => {
    const t = normalizar(texto);
    await new Promise((r) => setTimeout(r, 350));
    if (t.includes("stock") || t.includes("inventario")) return `Tienes ${totalStock} unidades en inventario.`;
    if (t.includes("alerta")) return `${stockBajo.length} producto(s) con stock bajo.`;
    if (t.includes("ganancia") || t.includes("utilidad")) return "Entra a Reportes para ver tu utilidad actual.";
    return "Puedo ayudarte con ventas, compras, gastos, inventario o reportes.";
  };

  return (
    <div>
      <p style={{ fontSize: "0.86rem", color: "var(--espresso-600)", margin: "0 0 4px" }}>
        Hola, <strong style={{ color: "var(--espresso-900)" }}>{perfil?.nombre || "bienvenido"}</strong>
      </p>
      <h1 className="font-titulo" style={{ fontWeight: 600, fontStyle: "italic", fontSize: "1.35rem", margin: "0 0 18px", color: "var(--espresso-900)", lineHeight: 1.25 }}>{saludoPorHora()}</h1>

      <div className="stats">
        <div className="stat-card"><p className="stat-label">Unidades en stock</p><p className="stat-value">{totalStock}</p></div>
        <div className="stat-card"><p className="stat-label">Alertas de stock</p><p className="stat-value" style={{ color: stockBajo.length ? "var(--cherry)" : "var(--espresso-900)" }}>{stockBajo.length}</p></div>
      </div>

      <div className="modules" style={{ marginBottom: 18 }}>
        {tiles.map((t) => (
          <button key={t.id} type="button" className={`mod-card ${t.clase}`} onClick={() => ir(t.id)}>
            <div className="mod-icon-wrap"><Icon name={t.icon} size={21} color="currentColor" /></div>
            <span className="mod-label">{t.label}</span>
          </button>
        ))}
      </div>

      <AsistenteVoz placeholder="Toca y dime qué necesitas registrar o consultar" onTexto={procesarConsulta} />
    </div>
  );
}

function Ingresos({ productos, ventas, onRegistrar }) {
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [llenado, setLlenado] = useState({});
  const montoVenta = useCallback((v) => v.cantidad * v.precio, []);
  const reporte = usePeriodoReporte(ventas, montoVenta);

  useEffect(() => { if (!productoId && productos[0]) setProductoId(productos[0].id); }, [productos, productoId]);

  const procesarVoz = async (texto) => {
    const resultado = await interpretarConGemini(texto, "ingreso", productos);
    const nums = extraerNumeros(texto);
    const prodLocal = detectarProducto(texto, productos);
    const pagoLocal = detectarFormaPago(texto);
    const prod = (resultado?.producto && productos.find((p) => normalizar(p.nombre).includes(normalizar(resultado.producto)))) || prodLocal;
    const cant = resultado?.cantidad ?? nums[0];
    const prec = resultado?.precio ?? nums[1] ?? (prod ? prod.precioVenta : undefined);
    const pago = resultado?.formaPago ?? pagoLocal;
    const flags = {};
    if (prod) { setProductoId(prod.id); flags.producto = true; }
    if (cant) { setCantidad(String(cant)); flags.cantidad = true; }
    if (prec) { setPrecio(String(prec)); flags.precio = true; }
    if (pago) { setFormaPago(pago); flags.pago = true; }
    setLlenado((prev) => ({ ...prev, ...flags }));
    if (cant && prec) return `Formulario listo · Total: ${money(cant * prec)}`;
    return "Formulario actualizado";
  };

  const guardar = () => {
    onRegistrar({ productoId: Number(productoId), cantidad: Number(cantidad), precio: Number(precio), formaPago });
    setCantidad(""); setPrecio(""); setLlenado({});
  };

  return (
    <div>
      <div className="info-banner pine"><Icon name="arrowDown" size={18} color="var(--pine)" /><span>Dinero que entra al negocio — cada venta suma a tu caja y descuenta del inventario</span></div>
      <AsistenteVoz placeholder='Ej: "vendí 5 café volcán a 31.460 en efectivo"' onTexto={procesarVoz} />
      <div className="form-card">
        <Campo label="Producto">
          <select className={llenado.producto ? "filled" : ""} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <div className="field-row">
          <Campo label="Cantidad"><input className={llenado.cantidad ? "filled" : ""} value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" /></Campo>
          <Campo label="Precio unitario"><input className={llenado.precio ? "filled" : ""} value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" /></Campo>
        </div>
        <Campo label="Forma de pago">
          <select className={llenado.pago ? "filled" : ""} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>{FORMAS_PAGO.map((f) => <option key={f}>{f}</option>)}</select>
        </Campo>
        <button type="button" className="submit-btn" style={{ marginTop: 6 }} onClick={guardar}>Guardar venta</button>
      </div>
      <p className="list-title">Reporte de ventas</p>
      <TabsPeriodo periodo={reporte.periodo} setPeriodo={reporte.setPeriodo} />
      <div className="stat-card" style={{ borderLeft: "3px solid var(--pine)", marginBottom: 16 }}>
        <p className="stat-label">{reporte.filtrados.length} venta{reporte.filtrados.length === 1 ? "" : "s"}</p>
        <p className="stat-value">{money(reporte.total)}</p>
      </div>
      {reporte.filtrados.length === 0 && <p className="list-empty">No hay ventas en este período.</p>}
      {reporte.filtrados.slice(0, 20).map((v) => {
        const prod = productos.find((p) => p.id === v.productoId);
        return (
          <div key={v.id} className="list-row">
            <div><div className="li-main">{prod?.nombre}</div><div className="li-sub">{v.cantidad} u · {v.formaPago}</div></div>
            <div className="li-amount" style={{ color: "var(--pine)" }}>+{money(v.cantidad * v.precio)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Compras({ productos, compras, onRegistrar, onAgregarProducto }) {
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [vencimiento, setVencimiento] = useState("");
  const [llenado, setLlenado] = useState({});
  const montoCompra = useCallback((c) => c.cantidad * c.precio, []);
  const reporte = usePeriodoReporte(compras, montoCompra);

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState("");
  const [creandoProducto, setCreandoProducto] = useState(false);

  useEffect(() => { if (!productoId && productos[0]) setProductoId(productos[0].id); }, [productos, productoId]);

  const procesarVoz = async (texto) => {
    const resultado = await interpretarConGemini(texto, "compra", productos);
    const nums = extraerNumeros(texto);
    const prodLocal = detectarProducto(texto, productos);
    const pagoLocal = detectarFormaPago(texto);
    const prod = (resultado?.producto && productos.find((p) => normalizar(p.nombre).includes(normalizar(resultado.producto)))) || prodLocal;
    const cant = resultado?.cantidad ?? nums[0];
    const prec = resultado?.precio ?? nums[1];
    const pago = resultado?.formaPago ?? pagoLocal;
    const flags = {};
    if (prod) { setProductoId(prod.id); flags.producto = true; }
    if (cant) { setCantidad(String(cant)); flags.cantidad = true; }
    if (prec) { setPrecio(String(prec)); flags.precio = true; }
    if (pago) { setFormaPago(pago); flags.pago = true; }
    setLlenado((prev) => ({ ...prev, ...flags }));
    if (cant && prec) return `Formulario listo · Total: ${money(cant * prec)}`;
    return "Formulario actualizado";
  };

  const guardar = () => {
    onRegistrar({ productoId: Number(productoId), cantidad: Number(cantidad), precio: Number(precio), formaPago, fechaVencimiento: vencimiento || null });
    setCantidad(""); setPrecio(""); setVencimiento(""); setLlenado({});
  };

  const crearProductoNuevo = async () => {
    if (!nuevoNombre.trim()) return;
    setCreandoProducto(true);
    const nuevoId = await onAgregarProducto({ nombre: nuevoNombre.trim(), stock: 0, costoProm: 0, precioVenta: nuevoPrecioVenta || 0 });
    setCreandoProducto(false);
    if (nuevoId) {
      setProductoId(nuevoId);
      setNuevoNombre(""); setNuevoPrecioVenta("");
      setMostrarNuevo(false);
    }
  };

  return (
    <div>
      <div className="info-banner cherry"><Icon name="cart" size={18} color="var(--cherry)" /><span>Dinero que sale del negocio — cada compra suma al inventario para poder vender</span></div>
      <AsistenteVoz placeholder='Ej: "compré 100 café volcán a 11.460 en efectivo"' onTexto={procesarVoz} />
      <div className="form-card cherry">
        <Campo label="Producto">
          <select className={llenado.producto ? "filled" : ""} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>

        {!mostrarNuevo ? (
          <button type="button" onClick={() => setMostrarNuevo(true)} style={{ background: "none", border: "none", padding: 0, marginBottom: 16, color: "var(--cherry)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>
            + ¿Es un producto nuevo?
          </button>
        ) : (
          <div style={{ background: "var(--cherry-bg)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <p style={{ margin: "0 0 10px", fontSize: "0.8rem", fontWeight: 700, color: "var(--cherry)" }}>Registrar producto nuevo</p>
            <Campo label="Nombre del producto"><input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Ej: Café Especial 500gr" /></Campo>
            <Campo label="Precio de venta"><input value={nuevoPrecioVenta} onChange={(e) => setNuevoPrecioVenta(e.target.value)} inputMode="numeric" placeholder="$ 0" /></Campo>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="submit-btn cherry" style={{ flex: 1 }} onClick={crearProductoNuevo} disabled={creandoProducto || !nuevoNombre.trim()}>
                {creandoProducto ? "Creando…" : "Crear y seleccionar"}
              </button>
              <button type="button" className="submit-btn ghost" style={{ flex: 1 }} onClick={() => { setMostrarNuevo(false); setNuevoNombre(""); setNuevoPrecioVenta(""); }}>
                Cancelar
              </button>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: "0.72rem", color: "var(--espresso-600)" }}>El costo y el stock inicial quedan en 0 — se completan automáticamente con esta misma compra.</p>
          </div>
        )}

        <div className="field-row">
          <Campo label="Cantidad"><input className={llenado.cantidad ? "filled" : ""} value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" /></Campo>
          <Campo label="Precio unitario"><input className={llenado.precio ? "filled" : ""} value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" /></Campo>
        </div>
        <Campo label="Forma de pago">
          <select className={llenado.pago ? "filled" : ""} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>{FORMAS_PAGO.map((f) => <option key={f}>{f}</option>)}</select>
        </Campo>
        <Campo label="Fecha de vencimiento (opcional)"><input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></Campo>
        <button type="button" className="submit-btn cherry" style={{ marginTop: 6 }} onClick={guardar}>Guardar compra</button>
      </div>
      <p className="list-title">Reporte de compras</p>
      <TabsPeriodo periodo={reporte.periodo} setPeriodo={reporte.setPeriodo} />
      <div className="stat-card" style={{ borderLeft: "3px solid var(--cherry)", marginBottom: 16 }}>
        <p className="stat-label">{reporte.filtrados.length} compra{reporte.filtrados.length === 1 ? "" : "s"}</p>
        <p className="stat-value">{money(reporte.total)}</p>
      </div>
      {reporte.filtrados.length === 0 && <p className="list-empty">No hay compras en este período.</p>}
      {reporte.filtrados.slice(0, 20).map((c) => {
        const prod = productos.find((p) => p.id === c.productoId);
        return (
          <div key={c.id} className="list-row">
            <div><div className="li-main">{prod?.nombre}</div><div className="li-sub">{c.cantidad} u · {c.formaPago}{c.saldo > 0 ? " · pendiente" : ""}</div></div>
            <div className="li-amount" style={{ color: "var(--cherry)" }}>-{money(c.cantidad * c.precio)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Gastos({ gastos, onRegistrar, onPagar, onEliminar }) {
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [formaPago, setFormaPago] = useState("Nequi");
  const [llenado, setLlenado] = useState({});
  const montoGasto = useCallback((g) => g.valor, []);
  const reporte = usePeriodoReporte(gastos, montoGasto);

  const procesarVoz = async (texto) => {
    const resultado = await interpretarConGemini(texto, "gasto", null);
    const nums = extraerNumeros(texto);
    const gLocal = detectarGasto(texto);
    const pagoLocal = detectarFormaPago(texto);
    const desc = resultado?.descripcion || gLocal;
    const val = resultado?.precio ?? nums[0];
    const pago = resultado?.formaPago ?? pagoLocal;
    const flags = {};
    if (desc) { setDescripcion(desc); flags.descripcion = true; }
    if (val) { setValor(String(val)); flags.valor = true; }
    if (pago) { setFormaPago(pago); flags.pago = true; }
    setLlenado((prev) => ({ ...prev, ...flags }));
    if (val) return `Gasto listo · ${money(val)}`;
    return "Formulario actualizado";
  };

  const guardar = () => { onRegistrar({ descripcion, valor: Number(valor), formaPago }); setDescripcion(""); setValor(""); setLlenado({}); };

  return (
    <div>
      <div className="info-banner caramel"><Icon name="receipt" size={18} color="var(--caramel-text)" /><span>Costos fijos y operativos del negocio (arriendo, servicios, nómina…)</span></div>
      <AsistenteVoz placeholder='Ej: "pagué 100 mil de agua por Nequi"' onTexto={procesarVoz} />
      <div className="form-card caramel">
        <Campo label="Descripción"><input className={llenado.descripcion ? "filled" : ""} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Arriendo, agua, luz…" /></Campo>
        <div className="field-row">
          <Campo label="Valor"><input className={llenado.valor ? "filled" : ""} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="numeric" /></Campo>
          <Campo label="Forma de pago"><select className={llenado.pago ? "filled" : ""} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>{FORMAS_PAGO.map((f) => <option key={f}>{f}</option>)}</select></Campo>
        </div>
        <button type="button" className="submit-btn caramel" style={{ marginTop: 6 }} onClick={guardar}>Guardar gasto</button>
      </div>
      <p className="list-title">Reporte de gastos</p>
      <TabsPeriodo periodo={reporte.periodo} setPeriodo={reporte.setPeriodo} />
      <div className="stat-card" style={{ borderLeft: "3px solid var(--caramel)", marginBottom: 16 }}>
        <p className="stat-label">{reporte.filtrados.length} gasto{reporte.filtrados.length === 1 ? "" : "s"}</p>
        <p className="stat-value">{money(reporte.total)}</p>
      </div>
      {reporte.filtrados.length === 0 && <p className="list-empty">No hay gastos en este período.</p>}
      {reporte.filtrados.slice(0, 20).map((g) => (
        <div key={g.id} className="list-row">
          <div><div className="li-main">{g.descripcion}</div><div className="li-sub">{g.formaPago}{!g.pagado ? " · pendiente" : ""}</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="li-amount" style={{ color: "var(--caramel-text)" }}>{money(g.valor)}</span>
            {!g.pagado && <button type="button" onClick={() => onPagar(g.id)} className="submit-btn ghost" style={{ width: "auto", padding: "6px 10px", fontSize: "0.74rem" }}>Pagar</button>}
            {onEliminar && <button type="button" onClick={() => onEliminar(g.id)} className="submit-btn ghost" style={{ width: "auto", padding: "6px 10px", fontSize: "0.74rem", color: "var(--cherry)" }}>Eliminar</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Inventario({ productos, onAgregarProducto, onAjustarStock }) {
  const stockBajo = productos.filter((p) => p.stock < STOCK_MINIMO);
  const porVencer = productos.filter((p) => { const d = diasParaVencer(p.fechaVencimiento); return d !== null && d <= DIAS_ALERTA_VENCIMIENTO; });
  const [mostrarForm, setMostrarForm] = useState(false);
  const [modo, setModo] = useState("ajustar");
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [delta, setDelta] = useState("");
  const [vencimientoAjuste, setVencimientoAjuste] = useState("");
  const [nombre, setNombre] = useState("");
  const [stockInicial, setStockInicial] = useState("");
  const [costoInicial, setCostoInicial] = useState("");
  const [precioInicial, setPrecioInicial] = useState("");
  const [vencimientoInicial, setVencimientoInicial] = useState("");

  useEffect(() => { if (!productoId && productos[0]) setProductoId(productos[0].id); }, [productos, productoId]);

  const procesarVoz = async (texto) => {
    await new Promise((r) => setTimeout(r, 300));
    const prod = detectarProducto(texto, productos);
    if (prod) return `${prod.nombre}: ${prod.stock} unidades disponibles.`;
    return "Dime el nombre de un producto para consultar su stock.";
  };

  const guardarAjuste = () => { onAjustarStock(Number(productoId), Number(delta) || 0, vencimientoAjuste || null); setDelta(""); setVencimientoAjuste(""); };
  const guardarNuevo = () => {
    onAgregarProducto({ nombre, stock: stockInicial, costoProm: costoInicial, precioVenta: precioInicial, fechaVencimiento: vencimientoInicial || null });
    setNombre(""); setStockInicial(""); setCostoInicial(""); setPrecioInicial(""); setVencimientoInicial("");
  };

  return (
    <div>
      <div className="info-banner dusk"><Icon name="package" size={18} color="var(--dusk)" /><span>Consulta y ajusta las existencias de cada producto</span></div>
      <AsistenteVoz placeholder='Ej: "¿cuánto stock de café volcán me queda?"' onTexto={procesarVoz} />

      {stockBajo.length > 0 && <div className="info-banner cherry" style={{ marginBottom: 10 }}><Icon name="alertTriangle" size={16} color="var(--cherry)" /><span>{stockBajo.length} producto(s) con stock por debajo de {STOCK_MINIMO} unidades</span></div>}
      {porVencer.length > 0 && <div className="info-banner caramel" style={{ marginBottom: 14 }}><Icon name="alertTriangle" size={16} color="var(--caramel-text)" /><span>{porVencer.length} producto(s) vencidos o próximos a vencer</span></div>}

      <p className="list-title">Productos</p>
      {productos.map((p) => {
        const bajo = p.stock < STOCK_MINIMO;
        const dias = diasParaVencer(p.fechaVencimiento);
        const vence = dias !== null && dias <= DIAS_ALERTA_VENCIMIENTO;
        return (
          <div key={p.id} className="stock-row">
            <div>
              <div className="si-name">{p.nombre}</div>
              <div className={`si-qty ${bajo ? "low" : ""}`}>{p.stock} unidades{bajo ? " · stock bajo" : ""}</div>
              <div className="si-vence">Costo: {money(p.costoProm)} · Venta: {money(p.precioVenta)}</div>
              {p.fechaVencimiento && <div className={`si-vence ${vence ? "pronto" : ""}`}>{dias < 0 ? `Venció hace ${Math.abs(dias)} días` : dias === 0 ? "Vence hoy" : `Vence en ${dias} días`}</div>}
            </div>
            <div className="si-qty-num">{p.stock} u</div>
          </div>
        );
      })}

      <div style={{ marginTop: 18 }}>
        {!mostrarForm ? (
          <button type="button" className="submit-btn ghost" onClick={() => setMostrarForm(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="package" size={16} /> Registrar inventario manual
          </button>
        ) : (
          <div className="form-card dusk">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.92rem", color: "var(--espresso-900)" }}>Inventario manual</p>
              <button type="button" onClick={() => setMostrarForm(false)} style={{ background: "none", border: "none", fontSize: "0.78rem", color: "var(--espresso-600)", cursor: "pointer" }}>Cerrar</button>
            </div>
            <div className="period-tabs">
              <button type="button" className={`period-tab ${modo === "ajustar" ? "active" : ""}`} onClick={() => setModo("ajustar")}>Ajustar existente</button>
              <button type="button" className={`period-tab ${modo === "nuevo" ? "active" : ""}`} onClick={() => setModo("nuevo")}>Producto nuevo</button>
            </div>
            {modo === "ajustar" ? (
              <>
                <Campo label="Producto">
                  <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} (actual: {p.stock} u)</option>)}
                  </select>
                </Campo>
                <Campo label="Cantidad a sumar o restar (opcional)"><input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Ej: 20 o -5" inputMode="numeric" /></Campo>
                <Campo label="Fecha de vencimiento (opcional)"><input type="date" value={vencimientoAjuste} onChange={(e) => setVencimientoAjuste(e.target.value)} /></Campo>
                <button type="button" className="submit-btn dusk" onClick={guardarAjuste}>Aplicar</button>
              </>
            ) : (
              <>
                <Campo label="Nombre del producto"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Café Especial 500gr" /></Campo>
                <div className="field-row">
                  <Campo label="Stock inicial"><input value={stockInicial} onChange={(e) => setStockInicial(e.target.value)} inputMode="numeric" /></Campo>
                  <Campo label="Costo promedio"><input value={costoInicial} onChange={(e) => setCostoInicial(e.target.value)} inputMode="numeric" /></Campo>
                </div>
                <Campo label="Precio de venta"><input value={precioInicial} onChange={(e) => setPrecioInicial(e.target.value)} inputMode="numeric" /></Campo>
                <Campo label="Fecha de vencimiento (opcional)"><input type="date" value={vencimientoInicial} onChange={(e) => setVencimientoInicial(e.target.value)} /></Campo>
                <button type="button" className="submit-btn dusk" onClick={guardarNuevo}>Agregar producto</button>
              </>
            )}
          </div>
        )}
      </div>
      <p style={{ marginTop: 14, fontSize: "0.78rem", color: "var(--espresso-600)" }}>El inventario se actualiza automáticamente con cada compra (entrada) y cada venta (salida). El costo promedio se recalcula por compra.</p>
    </div>
  );
}

function GraficoSemana({ series }) {
  const max = Math.max(1, ...series.flatMap((s) => s.datos.map((d) => d.total)));
  const dias = series[0]?.datos || [];
  return (
    <div className="bars">
      {dias.map((_, i) => (
        <div key={i} className="bar-wrap">
          <div className="bar-group">
            {series.map((s) => {
              const valor = s.datos[i]?.total || 0;
              const alturaPct = Math.max((valor / max) * 100, valor > 0 ? 4 : 0);
              return <div key={s.label} title={`${s.label}: ${money(valor)}`} className="bar" style={{ height: `${alturaPct}%`, background: s.color }} />;
            })}
          </div>
          <span className="bar-day">{dias[i].label}</span>
        </div>
      ))}
    </div>
  );
}

function Linea({ label, valor, fuerte }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.88rem" }}>
      <span style={{ color: fuerte ? "var(--espresso-900)" : "var(--espresso-600)", fontWeight: fuerte ? 600 : 400 }}>{label}</span>
      <span style={{ color: "var(--espresso-900)", fontWeight: fuerte ? 700 : 600 }}>{money(valor)}</span>
    </div>
  );
}

function VolverBoton({ onClick }) {
  return <button type="button" onClick={onClick} style={{ background: "none", border: "none", color: "var(--caramel-text)", fontWeight: 700, fontSize: "0.85rem", marginBottom: 14, cursor: "pointer", padding: 0 }}>← Volver a reportes</button>;
}

function FlujoCaja({ ventas, compras, gastos, volver }) {
  const [periodo, setPeriodo] = useState("dia");
  const calculo = useMemo(() => {
    const ingresos = ventas.filter((v) => v.formaPago === "Efectivo" && dentroDePeriodo(v.fecha, periodo)).reduce((s, v) => s + v.cantidad * v.precio, 0);
    const comprasEf = compras.filter((c) => c.formaPago === "Efectivo" && dentroDePeriodo(c.fecha, periodo)).reduce((s, c) => s + c.cantidad * c.precio, 0);
    const gastosEf = gastos.filter((g) => g.formaPago === "Efectivo" && dentroDePeriodo(g.fecha, periodo)).reduce((s, g) => s + g.valor, 0);
    return { ingresos, comprasEf, gastosEf, total: ingresos - comprasEf - gastosEf };
  }, [ventas, compras, gastos, periodo]);

  return (
    <div>
      <VolverBoton onClick={volver} />
      <p className="list-title">Flujo de Caja</p>
      <TabsPeriodo periodo={periodo} setPeriodo={setPeriodo} />
      <div className="form-card">
        <Linea label="Ingresos recibidos en efectivo" valor={calculo.ingresos} />
        <Linea label="Compras pagadas en efectivo" valor={-calculo.comprasEf} />
        <Linea label="Gastos pagados en efectivo" valor={-calculo.gastosEf} />
        <div style={{ borderTop: "1px solid var(--cream-dim)", marginTop: 6, paddingTop: 6 }}><Linea label="Total en caja" valor={calculo.total} fuerte /></div>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--espresso-600)", marginTop: 10 }}>Solo cuenta movimientos pagados en efectivo — las ventas/compras a crédito o por Nequi/tarjeta no mueven la caja física.</p>
    </div>
  );
}

function ListaCuentas({ titulo, items, productos, tipo, onAccion, volver }) {
  const [montos, setMontos] = useState({});
  return (
    <div>
      <VolverBoton onClick={volver} />
      <p className="list-title">{titulo}</p>
      {items.length === 0 && <p className="list-empty">No hay pendientes.</p>}
      {items.map((it) => {
        const prod = tipo === "cobrar" || it.tipo === "Compra" ? productos.find((p) => p.id === it.productoId) : null;
        const nombre = it.tipo === "Gasto" ? it.descripcion : prod?.nombre;
        const accionable = (tipo === "cobrar" && it.saldo > 0) || (tipo === "pagar" && it.tipo === "Compra" && it.saldo > 0);
        const montoActual = montos[it.id] ?? it.saldo;
        return (
          <div key={it.id} className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="li-main">{nombre}</span>
              <span className="li-amount" style={{ color: "var(--cherry)" }}>{money(it.saldo)}</span>
            </div>
            {accionable && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="number"
                  value={montoActual}
                  max={it.saldo}
                  min={0}
                  onChange={(e) => setMontos((m) => ({ ...m, [it.id]: e.target.value }))}
                  style={{ width: 110, padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--cream-dim)", fontSize: "0.8rem", fontFamily: "'Karla', sans-serif" }}
                />
                <button
                  type="button"
                  className="submit-btn ghost"
                  style={{ width: "auto", padding: "7px 12px", fontSize: "0.78rem" }}
                  onClick={() => onAccion(it.id, Math.min(Number(montoActual) || 0, it.saldo))}
                >
                  {tipo === "cobrar" ? "Registrar abono" : "Registrar pago"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Reportes({ reportes, productos, ventas, compras, gastos, onAbonarVenta, onPagarCompra }) {
  const [vista, setVista] = useState("resumen");
  const { totalVentas, totalGastos, utilidad, cuentasPorCobrar, cuentasPorPagar, semana } = reportes;

  if (vista === "cobrar") return <ListaCuentas titulo="Cuentas por cobrar" items={cuentasPorCobrar} productos={productos} tipo="cobrar" onAccion={onAbonarVenta} volver={() => setVista("resumen")} />;
  if (vista === "pagar") return <ListaCuentas titulo="Cuentas por pagar" items={cuentasPorPagar} productos={productos} tipo="pagar" onAccion={onPagarCompra} volver={() => setVista("resumen")} />;
  if (vista === "flujo") return <FlujoCaja ventas={ventas} compras={compras} gastos={gastos} volver={() => setVista("resumen")} />;

  return (
    <div>
      <div className="info-banner plum"><Icon name="bars" size={18} color="var(--plum)" /><span>Resumen de tu negocio — ventas, gastos y ganancia</span></div>
      <AsistenteVoz placeholder='Ej: "¿cuál fue mi ganancia esta semana?"' onTexto={async () => `Tu utilidad acumulada es ${money(utilidad)}.`} />

      <div className="stats3">
        <div className="stat-card" style={{ borderLeft: "3px solid var(--pine)" }}><p className="stat-label">Ventas</p><p className="stat-value">{money(totalVentas)}</p></div>
        <div className="stat-card" style={{ borderLeft: "3px solid var(--cherry)" }}><p className="stat-label">Gastos</p><p className="stat-value">{money(totalGastos)}</p></div>
        <div className="stat-card" style={{ borderLeft: `3px solid ${utilidad >= 0 ? "var(--pine)" : "var(--cherry)"}` }}><p className="stat-label">Ganancia</p><p className="stat-value">{money(utilidad)}</p></div>
      </div>

      <p className="list-title">Últimos 7 días</p>
      <GraficoSemana series={[{ label: "Ventas", color: "var(--pine)", datos: semana.ventas }, { label: "Compras", color: "var(--cherry)", datos: semana.compras }, { label: "Gastos", color: "var(--caramel)", datos: semana.gastos }]} />
      <div style={{ display: "flex", gap: 14, margin: "10px 0 20px", fontSize: "0.7rem", color: "var(--espresso-600)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--pine)", display: "inline-block" }} />Ventas</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--cherry)", display: "inline-block" }} />Compras</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--caramel)", display: "inline-block" }} />Gastos</span>
      </div>

      <div className="form-card">
        <p style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 8, color: "var(--espresso-900)" }}>Estado de resultado</p>
        <Linea label="Total ventas" valor={totalVentas} />
        <Linea label="Costo de venta" valor={-reportes.totalCosto} />
        <Linea label="Gastos" valor={-totalGastos} />
        <div style={{ borderTop: "1px solid var(--cream-dim)", marginTop: 6, paddingTop: 6 }}><Linea label="Utilidad" valor={utilidad} fuerte /></div>
      </div>

      <button type="button" className="report-link" onClick={() => setVista("flujo")}>
        <span className="rl-left"><Icon name="bars" size={16} color="var(--dusk)" /> Flujo de Caja</span>
        <span className="rl-right"><Icon name="chevronRight" size={14} /></span>
      </button>
      <button type="button" className="report-link" onClick={() => setVista("cobrar")}>
        <span className="rl-left"><Icon name="users" size={16} color="var(--dusk)" /> Cuentas por cobrar</span>
        <span className="rl-right">{cuentasPorCobrar.length} <Icon name="chevronRight" size={14} /></span>
      </button>
      <button type="button" className="report-link" onClick={() => setVista("pagar")}>
        <span className="rl-left"><Icon name="truck" size={16} color="var(--dusk)" /> Cuentas por pagar</span>
        <span className="rl-right">{cuentasPorPagar.length} <Icon name="chevronRight" size={14} /></span>
      </button>
    </div>
  );
}

export default App;
