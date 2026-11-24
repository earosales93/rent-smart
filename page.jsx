'use client';

/** Pantalla 7 · Detalle del Vehículo */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import VehiculoService from '@/app/services/vehiculoService';
import ReservaService, { cotizarLocalmente } from '@/app/services/reservaService';
import ClienteService from '@/app/services/clienteService';
import RutaProtegida from '@/app/components/RutaProtegida';
import { useAuth } from '@/app/context/AuthContext';
import Cargando from '@/app/components/Cargando';
import { MensajeError, MensajeExito } from '@/app/components/Mensajes';
import { EstadoVehiculo, EstadoReserva } from '@/app/components/Etiqueta';
import { Panel } from '@/app/components/Tarjetas';
import { moneda, numero, fechaLarga, hoyIso, ETIQUETAS_ESTADO_VEHICULO } from '@/app/lib/formato';
import { hayTraslape } from '@/app/lib/negocio';
import { ESTADOS_QUE_OCUPAN } from '@/app/lib/constantes';

function DetalleVehiculo() {
  const { id } = useParams();
  const router = useRouter();
  const { esPersonal, uid, usuario } = useAuth();

  const [vehiculo, setVehiculo] = useState(null);
  const [reservasActivas, setReservasActivas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);

  const [fechas, setFechas] = useState({ fechaInicio: hoyIso(1), fechaFin: hoyIso(4) });
  const [clientes, setClientes] = useState([]);
  const [clienteElegido, setClienteElegido] = useState('');
  const [reservando, setReservando] = useState(false);
  const [errorReserva, setErrorReserva] = useState(null);

  /**
   * El API anterior devolvía el vehículo con sus reservas activas incrustadas.
   * Firestore no compone documentos, así que la pantalla pide las dos cosas
   * en paralelo y las une aquí.
   */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [data, reservas] = await Promise.all([
        VehiculoService.obtenerVehiculo(id),
        ReservaService.obtenerReservas({ vehiculoId: id }),
      ]);
      setVehiculo(data);
      setReservasActivas(reservas.filter((r) => ESTADOS_QUE_OCUPAN.includes(r.estado)));
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

  useEffect(() => {
    if (!esPersonal) return;
    ClienteService.obtenerClientes()
      .then(setClientes)
      .catch(() => setClientes([]));
  }, [esPersonal]);

  const cotizacion = useMemo(
    () =>
      vehiculo ? cotizarLocalmente(vehiculo.precioPorDia, fechas.fechaInicio, fechas.fechaFin) : null,
    [vehiculo, fechas]
  );

  /**
   * Choque local con las reservas activas ya mostradas, antes de escribir en
   * Firestore. Usa la misma regla de traslape que valida el servicio.
   */
  const choque = useMemo(() => {
    if (!vehiculo || !cotizacion) return null;
    return (
      reservasActivas.find((r) =>
        hayTraslape(fechas.fechaInicio, fechas.fechaFin, r.fechaInicio, r.fechaFin)
      ) || null
    );
  }, [vehiculo, reservasActivas, fechas, cotizacion]);

  const reservar = async (e) => {
    e.preventDefault();
    setErrorReserva(null);

    // La reserva guarda el uid del cliente y una copia de su nombre: es la
    // forma de mostrarlo en los listados sin un JOIN, que Firestore no tiene.
    const destino = esPersonal
      ? clientes.find((c) => String(c.uid) === String(clienteElegido))
      : { uid, nombre: usuario.nombre };

    if (!destino?.uid) {
      setErrorReserva('Selecciona el cliente a nombre de quien va la reserva.');
      return;
    }

    setReservando(true);
    try {
      const reserva = await ReservaService.crearReserva({
        vehiculoId: vehiculo.id,
        uid: destino.uid,
        cliente: destino.nombre,
        fechaInicio: fechas.fechaInicio,
        fechaFin: fechas.fechaFin,
      });
      setExito(`Reserva ${reserva.codigo} creada por ${moneda(reserva.total)}.`);
      await cargar();
      setTimeout(() => router.push(esPersonal ? '/reservas' : '/mis-reservas'), 1800);
    } catch (err) {
      setErrorReserva(err.message);
    } finally {
      setReservando(false);
    }
  };

  if (cargando) return <Cargando mensaje="Cargando el vehículo…" />;

  if (error || !vehiculo) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <MensajeError mensaje={error || 'El vehículo no existe.'} onReintentar={cargar} />
        <Link href="/buscar" className="text-sm font-semibold text-blue-600 hover:text-blue-800">
          ← Volver a la búsqueda
        </Link>
      </div>
    );
  }

  const ficha = [
    ['Año', vehiculo.anio],
    ['Categoría', vehiculo.categoria],
    ['Color', vehiculo.color],
    ['Transmisión', vehiculo.transmision],
    ['Combustible', vehiculo.combustible],
    ['Capacidad', `${vehiculo.capacidad} pasajeros`],
    ['Kilometraje', `${numero(vehiculo.kilometraje)} km`],
    ['Placa', vehiculo.placa],
  ];

  const puedeReservar = vehiculo.estado === 'disponible';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={esPersonal ? '/vehiculos' : '/buscar'}
        className="text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        ← {esPersonal ? 'Volver a la gestión de vehículos' : 'Volver a la búsqueda'}
      </Link>

      <MensajeExito mensaje={exito} />

      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        {/* ------------------------- Información ------------------------- */}
        <div className="space-y-6 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid h-56 place-items-center bg-gradient-to-br from-slate-100 to-slate-200 text-7xl">
              🚗
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    {vehiculo.marca} {vehiculo.modelo}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {vehiculo.anio} · {vehiculo.categoria}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-700">{moneda(vehiculo.precioPorDia)}</p>
                  <p className="text-xs text-slate-500">por día</p>
                </div>
              </div>

              <div className="mt-4">
                <EstadoVehiculo estado={vehiculo.estado} />
              </div>

              {vehiculo.descripcion && (
                <p className="mt-4 text-sm leading-relaxed text-slate-600">{vehiculo.descripcion}</p>
              )}

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 pt-5 sm:grid-cols-4">
                {ficha.map(([etiqueta, valor]) => (
                  <div key={etiqueta}>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</dt>
                    <dd className="mt-0.5 text-sm font-medium text-slate-900">{valor}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <Panel
            titulo="Calendario de ocupación"
            descripcion="Reservas activas que bloquean este vehículo."
          >
            {reservasActivas.length === 0 ? (
              <p className="text-sm text-slate-500">
                No hay reservas activas: el vehículo está libre en todo el calendario.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {reservasActivas.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-mono text-sm font-medium text-slate-900">{r.codigo}</p>
                      <p className="text-sm text-slate-600">
                        {fechaLarga(r.fechaInicio)} → {fechaLarga(r.fechaFin)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {esPersonal && r.cliente && (
                        <span className="text-sm text-slate-500">{r.cliente}</span>
                      )}
                      <EstadoReserva estado={r.estado} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* --------------------------- Reserva --------------------------- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <form
            onSubmit={reservar}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-900">Reservar este vehículo</h2>

            {!puedeReservar && (
              <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Este vehículo está marcado como{' '}
                <strong>{ETIQUETAS_ESTADO_VEHICULO[vehiculo.estado]}</strong> y no admite reservas.
              </p>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="fechaInicio" className="block text-sm font-medium text-slate-700">
                  Retiro
                </label>
                <input
                  id="fechaInicio"
                  type="date"
                  min={hoyIso()}
                  value={fechas.fechaInicio}
                  onChange={(e) => setFechas((f) => ({ ...f, fechaInicio: e.target.value }))}
                  disabled={!puedeReservar}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="fechaFin" className="block text-sm font-medium text-slate-700">
                  Devolución
                </label>
                <input
                  id="fechaFin"
                  type="date"
                  min={fechas.fechaInicio}
                  value={fechas.fechaFin}
                  onChange={(e) => setFechas((f) => ({ ...f, fechaFin: e.target.value }))}
                  disabled={!puedeReservar}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                />
              </div>

              {esPersonal && (
                <div>
                  <label htmlFor="cliente" className="block text-sm font-medium text-slate-700">
                    Cliente
                  </label>
                  <select
                    id="cliente"
                    value={clienteElegido}
                    onChange={(e) => setClienteElegido(e.target.value)}
                    disabled={!puedeReservar}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
                  >
                    <option value="">Selecciona…</option>
                    {clientes.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {cotizacion ? (
              <dl className="mt-5 space-y-1.5 rounded-lg bg-slate-50 p-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <dt>
                    {cotizacion.dias} {cotizacion.dias === 1 ? 'día' : 'días'} ×{' '}
                    {moneda(cotizacion.tarifaDiaria)}
                  </dt>
                  <dd>{moneda(cotizacion.bruto)}</dd>
                </div>
                {cotizacion.descuento > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Descuento {(cotizacion.porcentajeDescuento * 100).toFixed(0)}%</dt>
                    <dd>−{moneda(cotizacion.descuento)}</dd>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <dt>Subtotal</dt>
                  <dd>{moneda(cotizacion.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-slate-600">
                  <dt>IVA (13%)</dt>
                  <dd>{moneda(cotizacion.impuesto)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                  <dt>Total</dt>
                  <dd className="text-blue-700">{moneda(cotizacion.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-5 text-sm text-red-600">
                La devolución debe ser posterior al retiro.
              </p>
            )}

            {choque && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Esas fechas chocan con la reserva <strong>{choque.codigo}</strong> (
                {fechaLarga(choque.fechaInicio)} → {fechaLarga(choque.fechaFin)}). Elige otro rango.
              </p>
            )}

            <MensajeError mensaje={errorReserva} />

            {!esPersonal && (
              <p className="mt-4 text-xs text-slate-500">
                A nombre de <strong>{usuario.nombre}</strong>.
              </p>
            )}

            <button
              type="submit"
              disabled={!puedeReservar || !cotizacion || Boolean(choque) || reservando}
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reservando ? 'Reservando…' : 'Reservar ahora'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

export default function DetalleVehiculoPage() {
  return (
    <RutaProtegida>
      <DetalleVehiculo />
    </RutaProtegida>
  );
}
