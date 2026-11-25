'use client';

/**
 * Recuperación de contraseña.
 *
 * Hasta la etapa anterior el flujo tenía dos pasos —pedir un código y
 * confirmarlo— porque el código lo generaba el propio servidor y, al no haber
 * servicio de correo, se mostraba en pantalla. Firebase Authentication envía
 * un enlace firmado al correo del usuario y gestiona el cambio en su propia
 * página, así que el segundo paso desaparece: aquí solo se pide el correo.
 *
 * Tampoco se informa de si la cuenta existe. Decirlo permitiría averiguar qué
 * correos están registrados en el sistema, así que el mensaje de confirmación
 * es el mismo en ambos casos.
 */

import { useState } from 'react';
import Link from 'next/link';
import AuthService from '@/app/services/authService';
import { MensajeError, MensajeExito, ErrorCampo } from '@/app/components/Mensajes';
import { REGEX_EMAIL } from '@/app/lib/validaciones';

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const solicitar = async (e) => {
    e.preventDefault();
    setMensaje(null);
    setErrores({});

    if (!REGEX_EMAIL.test(email.trim())) {
      setErrores({ email: 'Ingresa un correo válido.' });
      return;
    }

    setEnviando(true);
    try {
      await AuthService.recuperar(email.trim());
      setEnviado(true);
    } catch (err) {
      setMensaje(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recuperar contraseña</h1>
        <p className="mt-1 text-sm text-slate-500">
          {enviado
            ? 'Revisa tu bandeja de entrada.'
            : 'Te enviaremos un enlace para definir una nueva contraseña.'}
        </p>

        <div className="mt-6">
          <MensajeError mensaje={mensaje} />

          {enviado ? (
            <>
              <MensajeExito
                mensaje={`Si ${email.trim()} corresponde a una cuenta registrada, recibirás un correo con el enlace para restablecer tu contraseña.`}
              />
              <p className="mt-4 text-sm text-slate-600">
                El enlace caduca en una hora. Si no lo ves, revisa la carpeta de correo no deseado.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEnviado(false);
                  setEmail('');
                }}
                className="mt-4 w-full text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Usar otro correo
              </button>
            </>
          ) : (
            <form onSubmit={solicitar} noValidate className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`mt-1 block w-full rounded-lg border px-3 py-2.5 text-slate-900 outline-none transition focus:ring-2 focus:ring-blue-500/30 ${
                    errores.email ? 'border-red-400' : 'border-slate-300 focus:border-blue-500'
                  }`}
                  placeholder="tucorreo@ejemplo.com"
                />
                <ErrorCampo mensaje={errores.email} />
              </div>
              <button
                type="submit"
                disabled={enviando}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {enviando ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-800">
            Volver al inicio de sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
