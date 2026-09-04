// api/parse-voz.js
// Función serverless de Vercel: recibe el texto ya transcrito por el navegador
// (Web Speech API) y le pide a Gemini que extraia los datos estructurados.
// La API key vive SOLO aquí, en el servidor — nunca llega al navegador.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { texto, tipo, productos } = req.body || {};
  if (!texto || typeof texto !== "string") {
    return res.status(400).json({ error: "Falta el texto a interpretar" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY no está configurada en Vercel" });
  }

  const listaProductos = Array.isArray(productos) ? productos.map((p) => p.nombre).join(", ") : "";

  const prompt = `Eres un asistente que extrae datos estructurados de lo que dicta por voz un microempresario colombiano para registrar movimientos de su negocio.

Tipo de registro: "${tipo}" (puede ser "ingreso" = venta, "compra", o "gasto").
Productos disponibles en el inventario: ${listaProductos || "(no aplica para gastos)"}.
Texto dictado por el usuario: "${texto}"

Responde ÚNICAMENTE con un objeto JSON válido (sin texto adicional, sin markdown), con esta forma exacta:
{
  "producto": "<nombre EXACTO de uno de los productos de la lista, o null si no aplica o no se menciona>",
  "cantidad": <número entero, o null si no se menciona>,
  "precio": <número entero en pesos colombianos, o null si no se menciona>,
  "formaPago": "<uno de: Efectivo, Nequi, Transferencia, Tarjeta, Crédito, o null si no se menciona>",
  "descripcion": "<solo si tipo es gasto: una descripción corta del gasto, o null>"
}`;

  try {
    const modelo = "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return res.status(502).json({ error: "Gemini no respondió correctamente", detalle });
    }

    const data = await respuesta.json();
    const textoRespuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoRespuesta) {
      return res.status(502).json({ error: "Respuesta vacía de Gemini" });
    }

    const parsed = JSON.parse(textoRespuesta);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
