import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// ⚠️ carrega o .env AQUI também
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error("❌ Variáveis do Supabase não carregadas");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default supabase;