export const metadata = {
  title: "Editor AI Creator",
  description: "Autocrie.ai — Estalen.ai"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, Arial" }}>
        <div style={{ minHeight: "100vh", background: "#0A0F24", color: "#fff" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
            <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 999,
                  background: "linear-gradient(90deg,#00AEEF,#6B5BFF)"
                }} />
                <strong>Editor AI Creator</strong>
              </div>
              <span style={{ opacity: 0.85 }}>Autocrie.ai</span>
            </header>
            <main style={{ paddingTop: 24 }}>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
