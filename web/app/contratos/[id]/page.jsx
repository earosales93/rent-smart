'use client';

/** Documento de contrato: versión imprimible / descargable. */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ContratoService from '@/app/services/contratoService';
import PerfilService from '@/app/services/perfilService';
import VehiculoService from '@/app/services/vehiculoService';
import RutaProtegida from '@/app/components/RutaProtegida';
import { useAuth } from '@/app/context/AuthContext';
import Cargando from '@/app/components/Cargando';
import { MensajeError } from '@/app/components/Mensajes';
import { EstadoContrato } from '@/app/components/Etiqueta';
import { moneda, fechaLarga } from '@/app/lib/formato';

function DocumentoContrato() {
  const { id } = useParams();
  const { esPersonal } = useAuth();
  const [contrato, setContrato] = useState(null);
  const [arrendatario, setArrendatario] = useState(null);
  const [unidad, setUnidad] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  /**
   * El contrato guarda una copia del nombre del cliente y del vehículo, que
   * es lo que necesitan los listados. El documento imprimible pide más —DUI,
   * dirección, categoría—, así que esos datos se leen de sus documentos
   * originales una vez cargado el contrato.
   */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const doc = await ContratoService.obtenerContrato(id);
      setContrato(doc);

      const [perfil, vehiculo] = await Promise.all([
        doc.uid ? PerfilService.obtener(doc.uid).catch(() => null) : null,
        doc.vehiculoId ? VehiculoService.obtenerVehiculo(doc.vehiculoId).catch(() => null) : null,
      ]);
      setArrendatario(perfil);
      setUnidad(vehiculo);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [id]);

  // Carga inicial de datos desde Firestore. La regla del compilador de React
  // desaconseja invocar setState dentro de un efecto; aquí es intencional
  // porque es el punto donde la pantalla se sincroniza con la base de datos.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const descargar = () => {
    if (!contrato) return;
    const lineas = [
      'RENT SMART — CONTRATO DE ARRENDAMIENTO DE VEHÍCULO',
      `Contrato: ${contrato.numero}`,
      `Reserva: ${contrato.reservaCodigo}`,
      `Emitido: ${contrato.fechaEmision}`,
      '',
      'ARRENDATARIO',
      `Nombre: ${contrato.cliente || ''}`,
      `Documento: ${arrendatario?.documento ?? ''}`,
      `Licencia: ${arrendatario?.licencia ?? ''}`,
      `Teléfono: ${arrendatario?.telefono ?? ''}`,
      `Dirección: ${arrendatario?.direccion ?? ''}`,
      '',
      'VEHÍCULO',
      `Unidad: ${contrato.vehiculo || ''}`,
      `Placa: ${contrato.placa || ''}`,
      `Categoría: ${unidad?.categoria ?? ''}`,
      '',
      'PERÍODO Y MONTOS',
      `Desde: ${contrato.fechaInicio}`,
      `Hasta: ${contrato.fechaFin}`,
      `Monto total: ${contrato.total}`,
      `Depósito: ${contrato.deposito}`,
      '',
      'CONDICIONES',
      contrato.condiciones,
      '',
      '_____________________          _____________________',
      'Arrendatario                          RENT SMART',
    ].join('\n');

    const blob = new Blob([lineas], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${contrato.numero}.txt`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return <Cargando mensaje="Cargando el contrato…" />;

  if (error || !contrato) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <MensajeError mensaje={error || 'El contrato no existe.'} onReintentar={cargar} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={esPersonal ? '/contratos' : '/mis-reservas'}
          className="text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          ← Volver
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={descargar}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Descargar
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Imprimir / PDF
          </button>
        </div>
      </div>

      <article className="mt-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-lg font-bold tracking-tight text-slate-900">
              RENT <span className="text-blue-600">SMART</span>
            </p>
            <h1 className="mt-1 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Contrato de arrendamiento de vehículo
            </h1>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-semibold text-slate-900">{contrato.numero}</p>
            <p className="text-slate-500">Emitido: {fechaLarga(contrato.fechaEmision)}</p>
            <div className="mt-2">
              <EstadoContrato estado={contrato.estado} />
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Arrendatario
            </h2>
            <dl className="mt-2 space-y-1 text-sm text-slate-800">
              <div>{contrato.cliente}</div>
              <div className="text-slate-600">DUI: {arrendatario?.documento || '—'}</div>
              <div className="text-slate-600">Licencia: {arrendatario?.licencia || '—'}</div>
              <div className="text-slate-600">{arrendatario?.direccion || '—'}</div>
              <div className="text-slate-600">{arrendatario?.email || '—'}</div>
            </dl>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehículo</h2>
            <dl className="mt-2 space-y-1 text-sm text-slate-800">
              <div>{contrato.vehiculo}</div>
              <div className="text-slate-600">Placa: {contrato.placa}</div>
              <div className="text-slate-600">Categoría: {unidad?.categoria || '—'}</div>
              <div className="text-slate-600">Reserva: {contrato.reservaCodigo}</div>
            </dl>
          </div>
        </section>

        <section className="mt-6 rounded-lg bg-slate-50 p-5 print:bg-white">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Período y montos
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">Desde</dt>
              <dd className="font-medium text-slate-900">{fechaLarga(contrato.fechaInicio)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Hasta</dt>
              <dd className="font-medium text-slate-900">{fechaLarga(contrato.fechaFin)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Monto total</dt>
              <dd className="font-semibold text-slate-900">{moneda(contrato.total)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Depósito</dt>
              <dd className="font-medium text-slate-900">{moneda(contrato.deposito)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Condiciones generales
          </h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
            {String(contrato.condiciones)
              .split('\n')
              .filter(Boolean)
              .map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
          </ol>
        </section>

        <section className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
          <div className="border-t border-slate-400 pt-2">
            {contrato.cliente}
            <br />
            Arrendatario
          </div>
          <div className="border-t border-slate-400 pt-2">
            RENT SMART
            <br />
            Arrendante
          </div>
        </section>
      </article>
    </div>
  );
}

export default function ContratoDetallePage() {
  return (
    <RutaProtegida>
      <DocumentoContrato />
    </RutaProtegida>
  );
}
