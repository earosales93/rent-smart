'use client';

/**
 * Acceso con Google.
 *
 * El botón no conoce Firebase: pide la operación al contexto de sesión, que
 * es quien habla con Authentication. En el navegador el acceso se resuelve en
 * una ventana emergente, de modo que la pantalla no se pierde.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, rutaInicioPorRol } from '@/app/context/AuthContext';

export default function BotonGoogle({ destino = null, onError = () => {} }) {
  const router = useRouter();
  const { iniciarSesionConGoogle } = useAuth();
  const [ocupado, setOcupado] = useState(false);

  const entrar = async () => {
    setOcupado(true);
    try {
      const usuario = await iniciarSesionConGoogle();
      // Si el navegador bloqueó la ventana emergente se usó la redirección:
      // la página se recarga sola y no hay nada que hacer aquí.
      if (usuario) router.replace(destino || rutaInicioPorRol(usuario.rol));
    } catch (e) {
      onError(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs uppercase tracking-wide text-slate-400">o</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={entrar}
        disabled={ocupado}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.29 9.14 5.38 12 5.38Z"
          />
        </svg>
        {ocupado ? 'Conectando con Google…' : 'Continuar con Google'}
      </button>
    </div>
  );
}
