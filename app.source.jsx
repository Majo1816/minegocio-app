import React, { useState, useRef, useMemo, useCallback } from "react";
import Icon from "./icons.jsx";
import { interpretarConGemini } from "./gemini.js";

// ---------- Datos iniciales (tomados del enunciado / Excel del examen) ----------
const initialProducts = [
  { id: 1, nombre: "Café Volcán en granos 250gr", stock: 50, costoProm: 11460, precioVenta: 31460 },
  { id: 2, nombre: "Café Finca en grano 454gr", stock: 50, costoProm: 45780, precioVenta: 65780 },
  { id: 3, nombre: "Café Mujeres Cafeteras en granos 454gr", stock: 50, costoProm: 45780, precioVenta: 65780 },
  { id: 4, nombre: "Café Origen Nariño en granos 454gr", stock: 50, costoProm: 45780, precioVenta: 65780 },
  { id: 5, nombre: "Café Colina en grano 454gr", stock: 50, costoProm: 36650, precioVenta: 56650 },
];

const STOCK_MINIMO = 30;
const FORMAS_PAGO = ["Efectivo", "Nequi", "Transferencia", "Tarjeta", "Crédito"];

const initialGastos = [
  { id: 1, descripcion: "Agua", valor: 100000, formaPago: "Nequi", pagado: true },
  { id: 2, descripcion: "Luz", valor: 70000, formaPago: "Nequi", pagado: true },
  { id: 3, descripcion: "Internet", valor: 150000, formaPago: "Nequi", pagado: true },
  { id: 4, descripcion: "Nómina", valor: 2000000, formaPago: "Nequi", pagado: true },
  { id: 5, descripcion: "Seguridad social", valor: 500000, formaPago: "Nequi", pagado: true },
  { id: 6, descripcion: "Arriendo", valor: 2000000, formaPago: "Nequi", pagado: true },
  { id: 7, descripcion: "Útiles de aseo", valor: 50000, formaPago: "Nequi", pagado: true },
  { id: 8, descripcion: "Vigilancia", valor: 70000, formaPago: "Nequi", pagado: true },
];

const initialVentas = [
  { id: 1, productoId: 1, cantidad: 50, precio: 31460, formaPago: "Efectivo", costoUnit: 11460, saldo: 0 },
  { id: 2, productoId: 2, cantidad: 100, precio: 65780, formaPago: "Nequi", costoUnit: 45780, saldo: 0 },
  { id: 3, productoId: 3, cantidad: 150, precio: 65780, formaPago: "Nequi", costoUnit: 45780, saldo: 0 },
  { id: 4, productoId: 4, cantidad: 200, precio: 65780, formaPago: "Nequi", costoUnit: 45780, saldo: 0 },
  { id: 5, productoId: 5, cantidad: 250, precio: 56650, formaPago: "Crédito", costoUnit: 36650, saldo: 250 * 56650 },
];

const initialCompras = [
  { id: 1, productoId: 1, cantidad: 100, precio: 11460, formaPago: "Efectivo", saldo: 0 },
  { id: 2, productoId: 2, cantidad: 150, precio: 45780, formaPago: "Nequi", saldo: 0 },
  { id: 3, productoId: 3, cantidad: 200, precio: 45780, formaPago: "Nequi", saldo: 0 },
  { id: 4, productoId: 4, cantidad: 250, precio: 45780, formaPago: "Crédito", saldo: 250 * 45780 },
  { id: 5, productoId: 5, cantidad: 300, precio: 36650, formaPago: "Crédito", saldo: 300 * 36650 },
];

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
const GASTOS_CATALOGO = ["Agua", "Luz", "Internet", "Nómina", "Seguridad social", "Arriendo", "Útiles de aseo", "Vigilancia"];
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

// ---------- App ----------
function App() {
  const [pantalla, setPantalla] = useState("inicio");
  const [productos, setProductos] = useState(initialProducts);
  const [ventas, setVentas] = useState(initialVentas);
  const [compras, setCompras] = useState(initialCompras);
  const [gastos, setGastos] = useState(initialGastos);
  const [toast, setToast] = useState(null);

  const mostrarToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 2600); };

  const registrarVenta = ({ productoId, cantidad, precio, formaPago }) => {
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) return mostrarToast("Selecciona un producto válido", "error");
    if (cantidad <= 0 || precio <= 0) return mostrarToast("Cantidad y precio deben ser mayores a 0", "error");
    if (prod.stock < cantidad) return mostrarToast(`Stock insuficiente de ${prod.nombre} (disponible: ${prod.stock})`, "error");
    setProductos((prev) => prev.map((p) => (p.id === productoId ? { ...p, stock: p.stock - cantidad } : p)));
    setVentas((prev) => [{ id: Date.now(), productoId, cantidad, precio, formaPago, costoUnit: prod.costoProm, saldo: formaPago === "Crédito" ? cantidad * precio : 0 }, ...prev]);
    mostrarToast(`Venta registrada: ${cantidad} × ${prod.nombre}`);
  };

  const registrarCompra = ({ productoId, cantidad, precio, formaPago }) => {
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) return mostrarToast("Selecciona un producto válido", "error");
    if (cantidad <= 0 || precio <= 0) return mostrarToast("Cantidad y precio deben ser mayores a 0", "error");
    setProductos((prev) => prev.map((p) => {
      if (p.id !== productoId) return p;
      const nuevoStock = p.stock + cantidad;
      const nuevoCosto = (p.stock * p.costoProm + cantidad * precio) / nuevoStock;
      return { ...p, stock: nuevoStock, costoProm: Math.round(nuevoCosto) };
    }));
    setCompras((prev) => [{ id: Date.now(), productoId, cantidad, precio, formaPago, saldo: formaPago === "Crédito" ? cantidad * precio : 0 }, ...prev]);
    mostrarToast(`Compra registrada: ${cantidad} × ${prod.nombre}`);
  };

  const registrarGasto = ({ descripcion, valor, formaPago }) => {
    if (!descripcion) return mostrarToast("Escribe una descripción", "error");
    if (valor <= 0) return mostrarToast("El valor debe ser mayor a 0", "error");
    setGastos((prev) => [{ id: Date.now(), descripcion, valor, formaPago, pagado: formaPago !== "Crédito" }, ...prev]);
    mostrarToast(`Gasto registrado: ${descripcion}`);
  };

  const pagarGasto = (id) => setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, pagado: true } : g)));
  const abonarVenta = (id, monto) => setVentas((prev) => prev.map((v) => (v.id === id ? { ...v, saldo: Math.max(0, v.saldo - monto) } : v)));
  const pagarCompra = (id, monto) => setCompras((prev) => prev.map((c) => (c.id === id ? { ...c, saldo: Math.max(0, c.saldo - monto) } : c)));

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
    return { totalVentas, totalCosto, totalGastos, utilidad, caja, cuentasPorCobrar, cuentasPorPagar };
  }, [ventas, compras, gastos]);

  const stockBajo = productos.filter((p) => p.stock < STOCK_MINIMO);

  return (
    <div className="app-frame flex flex-col">
      <Header pantalla={pantalla} />
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {pantalla === "inicio" && <Inicio productos={productos} stockBajo={stockBajo} ir={setPantalla} />}
        {pantalla === "ingresos" && <Ingresos productos={productos} ventas={ventas} onRegistrar={registrarVenta} />}
        {pantalla === "compras" && <Compras productos={productos} compras={compras} onRegistrar={registrarCompra} />}
        {pantalla === "gastos" && <Gastos gastos={gastos} onRegistrar={registrarGasto} onPagar={pagarGasto} />}
        {pantalla === "inventario" && <Inventario productos={productos} />}
        {pantalla === "reportes" && <Reportes reportes={reportes} productos={productos} onAbonarVenta={abonarVenta} onPagarCompra={pagarCompra} />}
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

const TITULOS = { inicio: "MiNegocio", ingresos: "Ingresos", compras: "Compras", gastos: "Gastos", inventario: "Inventario", reportes: "Reportes" };
function Header({ pantalla }) {
  return (
    <header className="border-b border-[#e4d9c9] bg-[#faf6f0] px-4 py-4">
      <p className="font-titulo text-lg font-semibold text-[#3b2a22]">{TITULOS[pantalla]}</p>
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

function Inicio({ productos, stockBajo, ir }) {
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
      <p className="mb-1 text-sm text-[#8a7f72]">Bienvenido</p>
      <p className="font-titulo mb-5 text-xl font-semibold text-[#3b2a22]">Café Volcán &amp; Cía.</p>
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
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");

  const [interpretando, setInterpretando] = useState(false);

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
      <CampoVoz placeholder='Ej: "vendí 5 café volcán a 31.460 en efectivo"' onTexto={procesarVoz} interpretando={interpretando} />
      <div className="rounded-xl bg-white p-4">
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
        <button onClick={guardar} className="mt-1 w-full rounded-lg bg-[#6b4f3b] py-2.5 text-sm font-medium text-white hover:bg-[#5a4230]">Guardar venta</button>
      </div>
      <p className="mb-2 mt-5 text-xs font-medium text-[#8a7f72]">Ventas recientes</p>
      <div className="space-y-2">
        {ventas.slice(0, 6).map((v) => {
          const prod = productos.find((p) => p.id === v.productoId);
          return (
            <div key={v.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm">
              <div><p className="text-[#3b2a22]">{prod?.nombre}</p><p className="text-xs text-[#8a7f72]">{v.cantidad} u · {v.formaPago}</p></div>
              <p className="font-medium text-[#3b6d11]">{money(v.cantidad * v.precio)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Compras({ productos, compras, onRegistrar }) {
  const [productoId, setProductoId] = useState(productos[0]?.id);
  const [cantidad, setCantidad] = useState("");
  const [precio, setPrecio] = useState("");
  const [formaPago, setFormaPago] = useState("Efectivo");

  const [interpretando, setInterpretando] = useState(false);

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
      <CampoVoz placeholder='Ej: "compré 100 café volcán a 11.460 en efectivo"' onTexto={procesarVoz} interpretando={interpretando} />
      <div className="rounded-xl bg-white p-4">
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
        <button onClick={guardar} className="mt-1 w-full rounded-lg bg-[#6b4f3b] py-2.5 text-sm font-medium text-white hover:bg-[#5a4230]">Guardar compra</button>
      </div>
      <p className="mb-2 mt-5 text-xs font-medium text-[#8a7f72]">Compras recientes</p>
      <div className="space-y-2">
        {compras.slice(0, 6).map((c) => {
          const prod = productos.find((p) => p.id === c.productoId);
          return (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 text-sm">
              <div><p className="text-[#3b2a22]">{prod?.nombre}</p><p className="text-xs text-[#8a7f72]">{c.cantidad} u · {c.formaPago}{c.saldo > 0 ? " · pendiente" : ""}</p></div>
              <p className="font-medium text-[#993c1d]">{money(c.cantidad * c.precio)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Gastos({ gastos, onRegistrar, onPagar }) {
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

function Reportes({ reportes, productos, onAbonarVenta, onPagarCompra }) {
  const [vista, setVista] = useState("resumen");
  const { totalVentas, totalCosto, totalGastos, utilidad, caja, cuentasPorCobrar, cuentasPorPagar } = reportes;

  if (vista === "cobrar") return <ListaCuentas titulo="Cuentas por cobrar" items={cuentasPorCobrar} productos={productos} tipo="cobrar" onAccion={onAbonarVenta} volver={() => setVista("resumen")} />;
  if (vista === "pagar") return <ListaCuentas titulo="Cuentas por pagar" items={cuentasPorPagar} productos={productos} tipo="pagar" onAccion={onPagarCompra} volver={() => setVista("resumen")} />;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#8a7f72]">Caja (efectivo)</p><p className="text-lg font-semibold text-[#3b2a22]">{money(caja)}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-[#8a7f72]">Utilidad del período</p><p className={`text-lg font-semibold ${utilidad >= 0 ? "text-[#3b6d11]" : "text-[#a3452f]"}`}>{money(utilidad)}</p></div>
      </div>
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

export default App;
