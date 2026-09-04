// Llama a nuestra función serverless (/api/parse-voz), que a su vez llama a Gemini
// de forma segura. Si algo falla (sin internet, sin key configurada, etc.),
// devuelve null y quien lo use debe caer de vuelta a la interpretación local.
export async function interpretarConGemini(texto, tipo, productos) {
  try {
    const r = await fetch("/api/parse-voz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto, tipo, productos }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
