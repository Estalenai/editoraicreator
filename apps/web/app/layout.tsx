import "./globals.css";
import { AppTopNav } from "../components/navigation/AppTopNav";

export const metadata = {
  title: "Editor AI Creator",
  description: "Editor AI Creator — Plataforma de criação com IA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="app-root-body">
        <div className="app-shell-bg">
          <div className="app-shell-wrapper">
            <header className="app-brand-bar">
              <div className="app-brand-mark-group">
                <div className="app-brand-mark" />
                <strong>Editor AI Creator</strong>
              </div>
              <span className="app-brand-badge">EditexAI</span>
            </header>
            <div className="app-shell-body">
              <AppTopNav />
              <main className="app-shell-main">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

