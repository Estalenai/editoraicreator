import "./globals.css";
import { AppTopNav } from "../components/navigation/AppTopNav";

export const metadata = {
  title: "Editor AI Creator",
  description: "Editor AI Creator — Plataforma de criação com IA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, Arial", background: "#060b1a" }}>
        <div
          style={{
            minHeight: "100vh",
            color: "#fff",
            background:
              "radial-gradient(1200px 480px at 15% -15%, rgba(52,245,255,0.2), transparent 60%), radial-gradient(900px 360px at 85% -20%, rgba(95,118,255,0.24), transparent 58%), #0A0F24",
          }}
        >
          <div className="app-shell-wrapper">
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(6, 14, 34, 0.55)",
                backdropFilter: "blur(8px)",
                boxShadow: "0 12px 32px rgba(2,6,23,0.32)",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 999,
                  background: "linear-gradient(90deg,#00AEEF,#6B5BFF)",
                  boxShadow: "0 0 14px rgba(52,245,255,0.65)",
                }} />
                <strong>Editor AI Creator</strong>
              </div>
              <span style={{ opacity: 0.85, fontWeight: 500 }}>EditexAI</span>
            </header>
            <div className="app-shell-body" style={{ paddingTop: 16 }}>
              <AppTopNav />
              <main className="app-shell-main">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

