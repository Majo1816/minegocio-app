import { createClient } from "@supabase/supabase-js";

// Estas dos credenciales son seguras para exponer en el navegador:
// la "publishable key" está diseñada para esto, siempre que la
// seguridad de las tablas (Row Level Security) esté activada, como
// ya la configuramos en Supabase.
const SUPABASE_URL = "https://jdpytpzfojtkoikmwtkx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yrhDEWiSAUmwXDLVSeDM-g_RpmOr6WF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
