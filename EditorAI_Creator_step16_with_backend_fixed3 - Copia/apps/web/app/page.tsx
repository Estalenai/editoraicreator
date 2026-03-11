import Link from "next/link";

export default function HomePage() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Bem-vindo ao Editor AI Creator</h1>
      <p style={{ margin: 0, opacity: 0.9 }}>
        Faça login para acessar seu dashboard (planos, coins e projetos).
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/login" style={btn()}>Entrar</Link>
        <Link href="/dashboard" style={btn(true)}>Dashboard</Link>
      </div>
    </div>
  );
}

function btn(secondary = false): React.CSSProperties {
  return {
    display: "inline-flex",
    padding: "10px 14px",
    borderRadius: 12,
    textDecoration: "none",
    color: secondary ? "#fff" : "#0A0F24",
    background: secondary ? "rgba(255,255,255,0.12)" : "#34F5FF",
    border: "1px solid rgba(255,255,255,0.14)"
  };
}
