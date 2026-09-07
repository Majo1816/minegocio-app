import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import Icon from "./icons.jsx";
import { interpretarConGemini } from "./gemini.js";
import { supabase } from "./supabaseClient.js";
import logoUrl from "./assets/logo.png";

const STOCK_MINIMO = 30;
const FORMAS_PAGO = ["Efectivo", "Nequi", "Transferencia", "Tarjeta", "Crédito"];
const GASTOS_CATALOGO = ["Agua", "Luz", "Internet", "Nómina", "Seguridad social", "Arriendo", "Útiles de aseo", "Vigilancia"];
const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function agruparUltimosDias(items, montoFn, dias = 7) {
  const hoy = new Date();
  const resultado = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    const clave = d.toISOString().slice(0, 10);
    const total = items.filter((it) => it.fecha && it.fecha.slice(0, 10) === clave).reduce((s, it) => s + montoFn(it), 0);
    resultado.push({ label: DIAS_SEMANA[d.getDay()], total });
  }
  return resultado;
}

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

function CampoVoz({ placeholder, onTexto, interpretando }) {
  const [ultimo, setUltimo] = useState("");
  const { escuchando, soportado, iniciar } = useVoz((texto) => { setUltimo(texto); onTexto(texto); });
  const estado = escuchando ? "escuchando" : interpretando ? "interpretando" : "listo";
  return (
    <div className="mb-4">
      <button
        onClick={iniciar}
        disabled={!soportado || interpretando}
        className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${estado === "escuchando" ? "border-[#8a6a4f] bg-[#f4ece2] animate-pulse" : "border-[#e4d9c9] bg-white hover:bg-[#faf6f0]"} ${!soportado ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${estado === "escuchando" ? "bg-[#8a6a4f] text-white" : "bg-[#efe4d6] text-[#6b4f3b]"}`}>
          <Icon name="microphone" size={16} />
        </span>
        <span className="text-sm text-[#6b6259]">
          {estado === "escuchando" ? "Escuchando…" : estado === "interpretando" ? "Interpretando con IA…" : ultimo || placeholder}
        </span>
      </button>
      {!soportado && <p className="mt-1.5 text-xs text-[#a06a4a]">Este navegador no soporta dictado por voz — usa el formulario manual de abajo.</p>}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-[#8a7f72]">{label}</label>
      {children}
    </div>
  );
}
const inputCls = "w-full rounded-lg border border-[#e4d9c9] bg-white px-3 py-2 text-sm text-[#3b2a22] outline-none focus:border-[#8a6a4f]";

// ---------- Login ----------
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const entrar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) setError("Correo o contraseña incorrectos.");
  };

  return (
    <div className="app-frame flex flex-col items-center justify-center px-8">
      <img src={logoUrl} alt="Café Tierra Querida" className="mb-4 h-24 w-24 rounded-full object-cover shadow-sm" />
      <p className="font-titulo mb-1 text-xl font-semibold text-[#3b2a22]">Café Tierra Querida</p>
      <p className="mb-6 text-sm text-[#8a7f72]">Inicia sesión para continuar</p>
      <form onSubmit={entrar} className="w-full max-w-xs">
        <Campo label="Correo">
          <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Campo>
        <Campo label="Contraseña">
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Campo>
        {error && <p className="mb-3 text-xs text-[#a3452f]">{error}</p>}
        <button type="submit" disabled={cargando} className="w-full rounded-lg bg-[#6b4f3b] py-2.5 text-sm font-medium text-white hover:bg-[#5a4230] disabled:opacity-60">
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-[#8a7f72]">
        ¿Eres empleado nuevo? Pídele a tu administrador que te cree una cuenta.
      </p>
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
  const [empleados, setEmpleados] = useState([]);
  const [toast, setToast] = useState(null);

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargandoSesion(false);
    });
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
    setProductos((prod || []).map((p) => ({ id: Number(p.id), nombre: p.nombre, stock: p.stock, costoProm: Number(p.costo_prom), precioVenta: Number(p.precio_venta) })));
    setVentas((vt || []).map((v) => ({ id: Number(v.id), productoId: Number(v.producto_id), cantidad: v.cantidad, precio: Number(v.precio), formaPago: v.forma_pago, costoUnit: Number(v.costo_unit), saldo: Number(v.saldo), fecha: v.creado_en })));
    setCompras((cp || []).map((c) => ({ id: Number(c.id), productoId: Number(c.producto_id), cantidad: c.cantidad, precio: Number(c.precio), formaPago: c.forma_pago, saldo: Number(c.saldo), fecha: c.creado_en })));
    setGastos((gs || []).map((g) => ({ id: Number(g.id), descripcion: g.descripcion, valor: Number(g.valor), formaPago: g.forma_pago, pagado: g.pagado, fecha: g.creado_en })));
  }, []);

  const cargarEmpleados = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id,nombre,rol").order("creado_en");
    setEmpleados(data || []);
  }, []);

  useEffect(() => {
    if (!session) { setPerfil(null); return; }
    (async () => {
      const { data } = await supabase.from("profiles").select("nombre,rol").eq("id", session.user.id).single();
      setPerfil(data || { nombre: session.user.email, rol: "empleado" });
      await cargarTodo();
    })();
  }, [session, cargarTodo]);

  useEffect(() => {
    if (perfil?.rol === "administrador") cargarEmpleados();
  }, [perfil, cargarEmpleados]);

  // Este cálculo debe declararse SIEMPRE en el mismo orden, antes de cualquier
  // "return" condicional de abajo — es una regla de los Hooks de React.
  const reportes = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + v.cantidad * v.precio, 0);
    const totalCosto = ventas.reduce((s, v) => s + v.cantidad * v.costoUnit, 0);
    const totalGastos = gastos.reduce((s, g) => s + g.valor, 0);
    const utilidad = totalVentas - totalCosto - totalGastos;
    const efectivoVentas = ventas.filter((v) => v.formaPago === "Efectivo").reduce((s, v) => s + v.cantidad * v.precio, 0);
    const efectivoCompras = compras.filter((c) => c.formaPago === "Efectivo").reduce((s, c) => s + c.cantidad * c.precio, 0);
    const efectivoGastos = gastos.filter((g) => g.formaPago === "Efectivo").reduce((s, g) => s + g.valor, 0);
    const caja = efectivoVentas - efectivoCompras - efectivoGastos;
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
    return { totalVentas, totalCosto, totalGastos, utilidad, caja, cuentasPorCobrar, cuentasPorPagar, semana };
  }, [ventas, compras, gastos]);

  if (cargandoSesion) {
    return <div className="app-frame flex items-center justify-center"><p className="text-sm text-[#8a7f72]">Cargando…</p></div>;
  }
  if (!session) return <Login />;
  if (!perfil) {
    return <div className="app-frame flex items-center justify-center"><p className="text-sm text-[#8a7f72]">Cargando tu perfil…</p></div>;
  }

  const esAdmin = perfil.rol === "administrador";

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

  const registrarCompra = async ({ productoId, cantidad, precio, formaPago }) => {
    const prod = productos.find((p) => p.id === Number(productoId));
    if (!prod) return mostrarToast("Selecciona un producto válido", "error");
    if (cantidad <= 0 || precio <= 0) return mostrarToast("Cantidad y precio deben ser mayores a 0", "error");
    const { error } = await supabase.from("compras").insert({
      producto_id: prod.id, cantidad, precio, forma_pago: formaPago,
      saldo: formaPago === "Crédito" ? cantidad * precio : 0, creado_por: session.user.id,
    });
    if (error) return mostrarToast("No se pudo guardar la compra", "error");
    await cargarTodo();
    mostrarToast(`Compra registrada: ${cantidad} × ${prod.nombre}`);
  };

  const registrarGasto = async ({ descripcion, valor, formaPago }) => {
    if (!descripcion) return mostrarToast("Escribe una descripción", "error");
    if (valor <= 0) return mostrarToast("El valor debe ser mayor a 0", "error");
    const { error } = await supabase.from("gastos").insert({
      descripcion, valor, forma_pago: formaPago, pagado: formaPago !== "Crédito", creado_por: session.user.id,
    });
    if (error) return mostrarToast("No se pudo guardar el gasto", "error");
    await cargarTodo();
    mostrarToast(`Gasto registrado: ${descripcion}`);
  };

  const pagarGasto = async (id) => { await supabase.from("gastos").update({ pagado: true }).eq("id", id); await cargarTodo(); };
  const abonarVenta = async (id) => { await supabase.from("ventas").update({ saldo: 0 }).eq("id", id); await cargarTodo(); };
  const pagarCompra = async (id) => { await supabase.from("compras").update({ saldo: 0 }).eq("id", id); await cargarTodo(); };
  const eliminarGasto = async (id) => { await supabase.from("gastos").delete().eq("id", id); await cargarTodo(); };
  const cambiarRol = async (id, nuevoRol) => { await supabase.from("profiles").update({ rol: nuevoRol }).eq("id", id); await cargarEmpleados(); };
  const cerrarSesion = async () => { await supabase.auth.signOut(); };

  const stockBajo = productos.filter((p) => p.stock < STOCK_MINIMO);

  return (
    <div className="app-frame flex flex-col">
      <Header pantalla={pantalla} perfil={perfil} esAdmin={esAdmin} onAdmin={() => setPantalla("administracion")} onLogout={cerrarSesion} />
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {pantalla === "inicio" && <Inicio productos={productos} stockBajo={stockBajo} ir={setPantalla} perfil={perfil} />}
        {pantalla === "ingresos" && <Ingresos productos={productos} ventas={ventas} onRegistrar={registrarVenta} />}
        {pantalla === "compras" && <Compras productos={productos} compras={compras} onRegistrar={registrarCompra} />}
        {pantalla === "gastos" && <Gastos gastos={gastos} onRegistrar={registrarGasto} onPagar={pagarGasto} onEliminar={esAdmin ? eliminarGasto : null} />}
        {pantalla === "inventario" && <Inventario productos={productos} />}
        {pantalla === "reportes" && <Reportes reportes={reportes} productos={productos} onAbonarVenta={abonarVenta} onPagarCompra={pagarCompra} />}
        {pantalla === "administracion" && esAdmin && <Administracion empleados={empleados} onCambiarRol={cambiarRol} volver={() => setPantalla("inicio")} />}
      </main>
      <NavInferior pantalla={pantalla} ir={setPantalla} alertas={stockBajo.length} />
      {toast && (
        <div className={`toast-anim fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${toast.tipo === "error" ? "bg-[#a3452f]" : "bg-[#3b6d11]"}`} style={{ maxWidth: "90%" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const TITULOS = { inicio: "Inicio", ingresos: "Ingresos", compras: "Compras", gastos: "Gastos", inventario: "Inventario", reportes: "Reportes", administracion: "Administración" };

function Header({ pantalla, perfil, esAdmin, onAdmin, onLogout }) {
  return (
    <header className="flex items-center justify-between border-b border-[#e4d9c9] bg-[#faf6f0] px-4 py-3">
      <div className="flex items-center gap-2">
        <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        <div>
          <p className="font-titulo text-sm font-semibold leading-tight text-[#3b2a22]">Café Tierra Querida</p>
          <p className="text-[10px] text-[#8a7f72]">{TITULOS[pantalla]}</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {esAdmin && (
          <button onClick={onAdmin} className="rounded-full p-1.5 hover:bg-[#f0e9dd]" title="Administración">
            <Icon name="settings" size={18} color="#6b4f3b" />
          </button>
        )}
        <button onClick={onLogout} className="rounded-full p-1.5 hover:bg-[#f0e9dd]" title="Cerrar sesión">
          <Icon name="logout" size={18} color="#6b4f3b" />
        </button>
      </div>
    </header>
  );
}

function NavInferior({ pantalla, ir, alertas }) {
  const items = [
    { id: "inicio", icon: "home", label: "Inicio" },
    { id: "ingresos", icon: "arrow-down-circle", label: "Ingresos" },
    { id: "inventario", icon: "package", label: "Inventario", badge: alertas },
    { id: "reportes", icon: "chart-bar", label: "Reportes" },
  ];
  return (
    <nav className="absolute bottom-0 left-0 flex w-full justify-around border-t border-[#e4d9c9] bg-white py-2">
      {items.map((it) => {
        const activo = pantalla === it.id;
        return (
          <button key={it.id} onClick={() => ir(it.id)} className="relative flex flex-col items-center gap-1 px-3 py-1">
            <Icon name={it.icon} size={20} color={activo ? "#6b4f3b" : "#b3a898"} />
            {it.badge > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#a3452f] text-[9px] text-white">{it.badge}</span>}
            <span className={`text-[10px] ${activo ? "text-[#6b4f3b]" : "text-[#b3a898]"}`}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Inicio({ productos, stockBajo, ir, perfil }) {
  const totalStock = productos.reduce((s, p) => s + p.stock, 0);
  const tiles = [
    { id: "ingresos", label: "Ingresos", icon: "arrow-down-circle", bg: "#eaf3de", fg: "#3b6d11" },
    { id: "compras", label: "Compras", icon: "shopping-cart", bg: "#faece7", fg: "#993c1d" },
    { id: "gastos", label: "Gastos", icon: "receipt", bg: "#faeeda", fg: "#854f0b" },
    { id: "inventario", label: "Inventario", icon: "package", bg: "#eeedfe", fg: "#3c3489" },
    { id: "reportes", label: "Reportes", icon: "chart-bar", bg: "#e6f1fb", fg: "#185fa5" },
  ];
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-sm text-[#8a7f72]">
        Hola, {perfil?.nombre || "bienvenido"}
        {perfil?.rol === "administrador" && <span className="rounded-full bg-[#eeedfe] px-2 py-0.5 text-[10px] font-medium text-[#3c3489]">Administrador</span>}
      </p>
      <p className="font-titulo mb-5 text-xl font-semibold text-[#3b2a22]">Café Tierra Querida</p>
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs text-[#8a7f72]">Unidades en stock</p>
          <p className="text-lg font-semibold text-[#3b2a22]">{totalStock}</p>
        </div>
        <div className="rounded-xl bg-white p-3">
          <p className="text-xs text-[#8a7f72]">Alertas de stock</p>
          <p className={`text-lg font-semibold ${stockBajo.length ? "text-[#a3452f]" : "text-[#3b2a22]"}`}>{stockBajo.length}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <button key={t.id} onClick={() => ir(t.id)} className="flex flex-col items-center justify-center gap-2 rounded-xl py-6 text-sm font-medium" style={{ backgroundColor: t.bg, color: t.fg }}>
            <Icon name={t.icon} size={24} />
            {t.label}
          </button>
        ))}
        <div className="flex items-center justify-center rounded-xl border border-dashed border-[#d8cbb8] p-3 text-center text-xs text-[#8a7f72]">
          Mantén presionado el micrófono en cada módulo para dictar
        </div>
      </div>
    </div>
  );
}

function Ingresos({ productos, ventas, onRegistrar }) {
  const COLOR = "#3b6d11";
  const COLOR_BG = "#eaf3de";
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [interpretando, setInterpretando] = useState(false);

  useEffect(() => { if (!productoId && productos[0]) setProductoId(productos[0].id); }, [productos, productoId]);

  const procesarVoz = async (texto) => {
    setInterpretando(true);
    const resultado = await interpretarConGemini(texto, "ingreso", productos);
    setInterpretando(false);

    const nums = extraerNumeros(texto);
    const prodLocal = detectarProducto(texto, productos);
    const pagoLocal = detectarFormaPago(texto);

    const prod = (resultado?.producto && productos.find((p) => normalizar(p.nombre).includes(normalizar(resultado.producto)))) || prodLocal;
    const cant = resultado?.cantidad ?? nums[0];
    const prec = resultado?.precio ?? nums[1] ?? (prod ? prod.precioVenta : undefined);
    const pago = resultado?.formaPago ?? pagoLocal;

    if (prod) setProductoId(prod.id);
    if (cant) setCantidad(String(cant));
    if (prec) setPrecio(String(prec));
    if (pago) setFormaPago(pago);
  };
  const guardar = () => { onRegistrar({ productoId: Number(productoId), cantidad: Number(cantidad), precio: Number(precio), formaPago }); setCantidad(""); setPrecio(""); };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: COLOR_BG, color: COLOR }}>
        <Icon name="arrow-down-circle" size={14} />
        Dinero que entra al negocio — cada venta suma a tu caja y descuenta del inventario
      </div>
      <CampoVoz placeholder='Ej: "vendí 5 café volcán a 31.460 en efectivo"' onTexto={procesarVoz} interpretando={interpretando} />
      <div className="rounded-xl border-t-4 bg-white p-4" style={{ borderColor: COLOR }}>
        <Campo label="Producto">
          <select className={inputCls} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <div className="flex gap-3">
          <div className="flex-1"><Campo label="Cantidad"><input className={inputCls} value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" /></Campo></div>
          <div className="flex-1"><Campo label="Precio unitario"><input className={inputCls} value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" /></Campo></div>
        </div>
        <Campo label="Forma de pago">
          <select className={inputCls} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>{FORMAS_PAGO.map((f) => <option key={f}>{f}</option>)}</select>
        </Campo>
        <button onClick={guardar} className="mt-1 w-full rounded-lg py-2.5 text-sm font-medium text-white" style={{ background: COLOR }}>Guardar venta</button>
      </div>
      <p className="mb-2 mt-5 text-xs font-medium text-[#8a7f72]">Ventas recientes</p>
      <div className="space-y-2">
        {ventas.slice(0, 6).map((v) => {
          const prod = productos.find((p) => p.id === v.productoId);
          return (
            <div key={v.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm">
              <div><p className="text-[#3b2a22]">{prod?.nombre}</p><p className="text-xs text-[#8a7f72]">{v.cantidad} u · {v.formaPago}</p></div>
              <p className="font-medium" style={{ color: COLOR }}>+{money(v.cantidad * v.precio)}</p>
            </div>
          );
        })}
        {ventas.length === 0 && <p className="text-xs text-[#8a7f72]">Aún no has registrado ninguna venta.</p>}
      </div>
    </div>
  );
}

function Compras({ productos, compras, onRegistrar }) {
  const COLOR = "#993c1d";
  const COLOR_BG = "#faece7";
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");
  const [interpretando, setInterpretando] = useState(false);

  useEffect(() => { if (!productoId && productos[0]) setProductoId(productos[0].id); }, [productos, productoId]);

  const procesarVoz = async (texto) => {
    setInterpretando(true);
    const resultado = await interpretarConGemini(texto, "compra", productos);
    setInterpretando(false);

    const nums = extraerNumeros(texto);
    const prodLocal = detectarProducto(texto, productos);
    const pagoLocal = detectarFormaPago(texto);

    const prod = (resultado?.producto && productos.find((p) => normalizar(p.nombre).includes(normalizar(resultado.producto)))) || prodLocal;
    const cant = resultado?.cantidad ?? nums[0];
    const prec = resultado?.precio ?? nums[1];
    const pago = resultado?.formaPago ?? pagoLocal;

    if (prod) setProductoId(prod.id);
    if (cant) setCantidad(String(cant));
    if (prec) setPrecio(String(prec));
    if (pago) setFormaPago(pago);
  };
  const guardar = () => { onRegistrar({ productoId: Number(productoId), cantidad: Number(cantidad), precio: Number(precio), formaPago }); setCantidad(""); setPrecio(""); };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium" style={{ background: COLOR_BG, color: COLOR }}>
        <Icon name="shopping-cart" size={14} />
        Dinero que sale del negocio — cada compra suma al inventario para poder vender
      </div>
      <CampoVoz placeholder='Ej: "compré 100 café volcán a 11.460 en efectivo"' onTexto={procesarVoz} interpretando={interpretando} />
      <div className="rounded-xl border-t-4 bg-white p-4" style={{ borderColor: COLOR }}>
        <Campo label="Producto">
          <select className={inputCls} value={productoId} onChange={(e) => setProductoId(e.target.value)}>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
        <div className="flex gap-3">
          <div className="flex-1"><Campo label="Cantidad"><input className={inputCls} value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" /></Campo></div>
          <div className="flex-1"><Campo label="Precio unitario"><input className={inputCls} value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" /></Campo></div>
        </div>
        <Campo label="Forma de pago">
          <select className={inputCls} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>{FORMAS_PAGO.map((f) => <option key={f}>{f}</option>)}</select>
        </Campo>
        <button onClick={guardar} className="mt-1 w-full rounded-lg py-2.5 text-sm font-medium text-white" style={{ background: COLOR }}>Guardar compra</button>
      </div>
      <p className="mb-2 mt-5 text-xs font-medium text-[#8a7f72]">Compras recientes</p>
      <div className="space-y-2">
        {compras.slice(0, 6).map((c) => {
          const prod = productos.find((p) => p.id === c.productoId);
          return (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm">
              <div><p className="text-[#3b2a22]">{prod?.nombre}</p><p className="text-xs text-[#8a7f72]">{c.cantidad} u · {c.formaPago}{c.saldo > 0 ? " · pendiente" : ""}</p></div>
              <p className="font-medium" style={{ color: COLOR }}>-{money(c.cantidad * c.precio)}</p>
            </div>
          );
        })}
        {compras.length === 0 && <p className="text-xs text-[#8a7f72]">Aún no has registrado ninguna compra.</p>}
      </div>
    </div>
  );
}

function Gastos({ gastos, onRegistrar, onPagar, onEliminar }) {
  const [descripcion, setDescripcion] = useState("");
  const [valor, setValor] = useState("");
  const [formaPago, setFormaPago] = useState("Nequi");
  const [interpretando, setInterpretando] = useState(false);

  const procesarVoz = async (texto) => {
    setInterpretando(true);
    const resultado = await interpretarConGemini(texto, "gasto", null);
    setInterpretando(false);

    const nums = extraerNumeros(texto);
    const gLocal = detectarGasto(texto);
    const pagoLocal = detectarFormaPago(texto);

    const desc = resultado?.descripcion || gLocal;
    const val = resultado?.precio ?? nums[0];
    const pago = resultado?.formaPago ?? pagoLocal;

    if (desc) setDescripcion(desc);
    if (val) setValor(String(val));
    if (pago) setFormaPago(pago);
  };
  const guardar = () => { onRegistrar({ descripcion, valor: Number(valor), formaPago }); setDescripcion(""); setValor(""); };

  return (
    <div>
      <CampoVoz placeholder='Ej: "pagué 100 mil de agua por Nequi"' onTexto={procesarVoz} interpretando={interpretando} />
      <div className="rounded-xl bg-white p-4">
        <Campo label="Descripción"><input className={inputCls} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Arriendo, agua, luz…" /></Campo>
        <div className="flex gap-3">
          <div className="flex-1"><Campo label="Valor"><input className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="numeric" /></Campo></div>
          <div className="flex-1"><Campo label="Forma de pago"><select className={inputCls} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>{FORMAS_PAGO.map((f) => <option key={f}>{f}</option>)}</select></Campo></div>
        </div>
        <button onClick={guardar} className="mt-1 w-full rounded-lg bg-[#6b4f3b] py-2.5 text-sm font-medium text-white hover:bg-[#5a4230]">Guardar gasto</button>
      </div>
      <p className="mb-2 mt-5 text-xs font-medium text-[#8a7f72]">Gastos del mes</p>
      <div className="space-y-2">
        {gastos.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm">
            <div><p className="text-[#3b2a22]">{g.descripcion}</p><p className="text-xs text-[#8a7f72]">{g.formaPago}{!g.pagado ? " · pendiente" : ""}</p></div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-[#854f0b]">{money(g.valor)}</p>
              {!g.pagado && <button onClick={() => onPagar(g.id)} className="rounded-md border border-[#e4d9c9] px-2 py-1 text-xs text-[#6b4f3b]">Pagar</button>}
              {onEliminar && <button onClick={() => onEliminar(g.id)} className="rounded-md border border-[#f3d5cb] px-2 py-1 text-xs text-[#a3452f]">Eliminar</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Inventario({ productos }) {
  const stockBajo = productos.filter((p) => p.stock < STOCK_MINIMO);
  const maxStock = Math.max(...productos.map((p) => p.stock), 1);
  return (
    <div>
      {stockBajo.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#faece7] px-3 py-2.5 text-sm text-[#993c1d]">
          <Icon name="alert-triangle" size={16} />
          <span>{stockBajo.length} producto(s) con stock por debajo de {STOCK_MINIMO} unidades</span>
        </div>
      )}
      <div className="space-y-3">
        {productos.map((p) => {
          const bajo = p.stock < STOCK_MINIMO;
          return (
            <div key={p.id} className="rounded-xl bg-white p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-sm text-[#3b2a22]">{p.nombre}</p>
                <p className={`text-sm font-medium ${bajo ? "text-[#a3452f]" : "text-[#3b6d11]"}`}>{p.stock} u</p>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0e9dd]">
                <div className={`h-full rounded-full ${bajo ? "bg-[#c9583d]" : "bg-[#6b9950]"}`} style={{ width: `${Math.min(100, (p.stock / maxStock) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-[#8a7f72]">Costo promedio: {money(p.costoProm)} · Venta: {money(p.precioVenta)}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-[#8a7f72]">El inventario se actualiza automáticamente con cada compra (entrada) y cada venta (salida). El costo promedio se recalcula por compra.</p>
    </div>
  );
}

function GraficoSemana({ series }) {
  const max = Math.max(1, ...series.flatMap((s) => s.datos.map((d) => d.total)));
  const dias = series[0]?.datos || [];
  return (
    <div className="mb-4 rounded-xl bg-white p-4">
      <p className="mb-3 text-sm font-medium text-[#3b2a22]">Últimos 7 días</p>
      <div className="flex items-end justify-between" style={{ height: 110 }}>
        {dias.map((_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: 90 }}>
              {series.map((s) => {
                const valor = s.datos[i]?.total || 0;
                const alturaPct = (valor / max) * 100;
                return (
                  <div
                    key={s.label}
                    title={`${s.label} · ${dias[i].label}: ${money(valor)}`}
                    style={{ height: `${Math.max(alturaPct, valor > 0 ? 4 : 0)}%`, background: s.color, width: 7, borderRadius: 3 }}
                  />
                );
              })}
            </div>
            <span className="text-[9px] text-[#8a7f72]">{dias[i].label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-[#8a7f72]">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Reportes({ reportes, productos, onAbonarVenta, onPagarCompra }) {
  const [vista, setVista] = useState("resumen");
  const { totalVentas, totalCosto, totalGastos, utilidad, caja, cuentasPorCobrar, cuentasPorPagar, semana } = reportes;

  if (vista === "cobrar") return <ListaCuentas titulo="Cuentas por cobrar" items={cuentasPorCobrar} productos={productos} tipo="cobrar" onAccion={onAbonarVenta} volver={() => setVista("resumen")} />;
  if (vista === "pagar") return <ListaCuentas titulo="Cuentas por pagar" items={cuentasPorPagar} productos={productos} tipo="pagar" onAccion={onPagarCompra} volver={() => setVista("resumen")} />;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#8a7f72]">Caja (efectivo)</p><p className="text-lg font-semibold text-[#3b2a22]">{money(caja)}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#8a7f72]">Utilidad del período</p><p className={`text-lg font-semibold ${utilidad >= 0 ? "text-[#3b6d11]" : "text-[#a3452f]"}`}>{money(utilidad)}</p></div>
      </div>

      <GraficoSemana
        series={[
          { label: "Ventas", color: "#3b6d11", datos: semana.ventas },
          { label: "Compras", color: "#993c1d", datos: semana.compras },
          { label: "Gastos", color: "#854f0b", datos: semana.gastos },
        ]}
      />

      <div className="mb-4 rounded-xl bg-white p-4">
        <p className="mb-2 text-sm font-medium text-[#3b2a22]">Estado de resultado</p>
        <Linea label="Total ventas" valor={totalVentas} />
        <Linea label="Costo de venta" valor={-totalCosto} />
        <Linea label="Gastos" valor={-totalGastos} />
        <div className="mt-1 border-t border-[#e4d9c9] pt-1.5"><Linea label="Utilidad" valor={utilidad} fuerte /></div>
      </div>
      <button onClick={() => setVista("cobrar")} className="mb-2 flex w-full items-center justify-between rounded-lg bg-white px-3 py-3 text-sm">
        <span className="flex items-center gap-2 text-[#3b2a22]"><Icon name="users" size={16} color="#185fa5" /> Cuentas por cobrar</span>
        <span className="flex items-center gap-1 text-[#8a7f72]">{cuentasPorCobrar.length} <Icon name="chevron-right" size={14} /></span>
      </button>
      <button onClick={() => setVista("pagar")} className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-3 text-sm">
        <span className="flex items-center gap-2 text-[#3b2a22]"><Icon name="truck" size={16} color="#185fa5" /> Cuentas por pagar</span>
        <span className="flex items-center gap-1 text-[#8a7f72]">{cuentasPorPagar.length} <Icon name="chevron-right" size={14} /></span>
      </button>
    </div>
  );
}

function Linea({ label, valor, fuerte }) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className={fuerte ? "font-medium text-[#3b2a22]" : "text-[#8a7f72]"}>{label}</span>
      <span className={fuerte ? "font-semibold text-[#3b2a22]" : "text-[#3b2a22]"}>{money(valor)}</span>
    </div>
  );
}

function ListaCuentas({ titulo, items, productos, tipo, onAccion, volver }) {
  return (
    <div>
      <button onClick={volver} className="mb-3 text-sm text-[#6b4f3b]">← Volver a reportes</button>
      <p className="mb-3 text-sm font-medium text-[#3b2a22]">{titulo}</p>
      {items.length === 0 && <p className="text-sm text-[#8a7f72]">No hay pendientes.</p>}
      <div className="space-y-2">
        {items.map((it) => {
          const prod = tipo === "cobrar" || it.tipo === "Compra" ? productos.find((p) => p.id === it.productoId) : null;
          const nombre = it.tipo === "Gasto" ? it.descripcion : prod?.nombre;
          return (
            <div key={it.id} className="rounded-lg bg-white px-3 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <p className="text-[#3b2a22]">{nombre}</p>
                <p className="font-medium text-[#a3452f]">{money(it.saldo)}</p>
              </div>
              {tipo === "cobrar" && it.saldo > 0 && <button onClick={() => onAccion(it.id, it.saldo)} className="mt-1.5 rounded-md border border-[#e4d9c9] px-2 py-1 text-xs text-[#6b4f3b]">Registrar abono total</button>}
              {tipo === "pagar" && it.tipo === "Compra" && it.saldo > 0 && <button onClick={() => onAccion(it.id, it.saldo)} className="mt-1.5 rounded-md border border-[#e4d9c9] px-2 py-1 text-xs text-[#6b4f3b]">Registrar pago total</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Administracion({ empleados, onCambiarRol, volver }) {
  return (
    <div>
      <button onClick={volver} className="mb-3 text-sm text-[#6b4f3b]">← Volver</button>
      <p className="mb-3 text-sm font-medium text-[#3b2a22]">Equipo</p>
      <div className="space-y-2">
        {empleados.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm">
            <div>
              <p className="text-[#3b2a22]">{e.nombre}</p>
              <p className="text-xs capitalize text-[#8a7f72]">{e.rol}</p>
            </div>
            <button
              onClick={() => onCambiarRol(e.id, e.rol === "administrador" ? "empleado" : "administrador")}
              className="rounded-md border border-[#e4d9c9] px-2 py-1 text-xs text-[#6b4f3b]"
            >
              {e.rol === "administrador" ? "Quitar admin" : "Hacer admin"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-[#8a7f72]">
        Para crear un nuevo empleado: ve al panel de Supabase → Authentication → Users → Add user,
        con su correo y una contraseña. Queda automáticamente como empleado.
      </p>
    </div>
  );
}

export default App;
