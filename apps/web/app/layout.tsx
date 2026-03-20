import "./globals.css";
import { AppTopNav } from "../components/navigation/AppTopNav";
import { MotionRuntime } from "../components/ui/MotionRuntime";

export const metadata = {
  title: "Editor AI Creator",
  description: "Editor AI Creator — Plataforma de criação com IA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="app-root-body">
        <MotionRuntime />
        <div className="app-shell-bg">
          <div className="app-shell-wrapper">
            <div className="app-shell-frame app-shell-system layout-contract-shell">
              <header className="app-shell-head app-shell-head-region layout-contract-shell-head">
                <div className="app-brand-mark-group">
                  <div className="app-brand-mark" />
                  <div className="app-shell-head-copy">
                    <strong>Editor AI Creator</strong>
                    <span className="app-shell-head-note">Workspace integrado para creators, editor, projetos e saída.</span>
                  </div>
                </div>
                <span className="app-brand-badge">EditexAI</span>
              </header>
              <div className="app-shell-body app-shell-workspace layout-contract-workspace">
                <AppTopNav />
                <main className="app-shell-main app-shell-canvas layout-contract-main">{children}</main>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

