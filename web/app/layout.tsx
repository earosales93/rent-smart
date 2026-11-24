import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import EstadoGlobal from "./components/EstadoGlobal";

export const metadata: Metadata = {
  title: "RENT SMART · Gestión y alquiler de vehículos",
  description:
    "Plataforma inteligente para la gestión y alquiler de vehículos: flota, reservas, contratos y reportes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <AuthProvider>
          <EstadoGlobal />
          <Navbar />
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">
<<<<<<< HEAD
            RENT SMART · Universidad Don Bosco · Grupo G
=======
            RENT SMART · UNIVERSIDAD DON BOSCO · Grupo G
>>>>>>> c27741b (chore: limpiar la nota de las cuentas de demostracion y actualizar el pie)
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
