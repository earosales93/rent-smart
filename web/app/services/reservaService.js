/**
 * Reservas en Cloud Firestore.
 *
 * Misma colección que la aplicación móvil. La web, además, opera sobre
 * reservas de cualquier cliente, porque el operador y el administrador las
 * gestionan desde el mostrador; las reglas de seguridad lo permiten solo a
 * quien tiene rol de administrador.
 */

import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';

import { obtenerDb, COLECCIONES } from '@/app/firebase/configuracion';
import { conProgreso, ErrorDatos } from './progreso';
import { calcularTarifa, puedeTransicionar, hayTraslape } from '@/app/lib/negocio';
import { ESTADOS_QUE_OCUPAN } from '@/app/lib/constantes';
import { hoy } from '@/app/lib/utilidades';
import ActividadService from './actividadService';

export function mapearReserva(documento) {
  const d = documento.data();
  return {
    id: documento.id,
    uid: d.uid ?? null,
    codigo: d.codigo ?? '',
    vehiculoId: d.vehiculoId ?? null,
    // Copia del nombre y la placa: Firestore no tiene JOIN, y sin ella el
    // detalle mostraría el vehículo como indefinido hasta cargar el catálogo.
    vehiculo: d.vehiculo ?? '',
    placa: d.placa ?? '',
    cliente: d.cliente ?? '',
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin,
    dias: Number(d.dias ?? 0),
    tarifaDiaria: Number(d.tarifaDiaria ?? 0),
    porcentajeDescuento: Number(d.porcentajeDescuento ?? 0),
    descuento: Number(d.descuento ?? 0),
    subtotal: Number(d.subtotal ?? 0),
    impuesto: Number(d.impuesto ?? 0),
    total: Number(d.total ?? 0),
    deposito: Number(d.deposito ?? 0),
    estado: d.estado ?? 'pendiente',
    lugarEntrega: d.lugarEntrega ?? '',
    observaciones: d.observaciones ?? '',
    fechaCreacion: d.fechaCreacion ?? null,
  };
}

function coleccion() {
  return collection(obtenerDb(), COLECCIONES.reservas);
}

export function generarCodigo() {
  return `RS-${String(Date.now()).slice(-6)}`;
}

export const ReservaService = {
  /** filtros: { uid, vehiculoId, estado } */
  obtenerReservas(filtros = {}) {
    return conProgreso(async () => {
      const restricciones = [];
      if (filtros.uid) restricciones.push(where('uid', '==', filtros.uid));
      if (filtros.vehiculoId) restricciones.push(where('vehiculoId', '==', String(filtros.vehiculoId)));
      if (filtros.estado) restricciones.push(where('estado', '==', filtros.estado));
      restricciones.push(orderBy('fechaInicio', 'desc'));

      const instantanea = await getDocs(query(coleccion(), ...restricciones));
      return instantanea.docs.map(mapearReserva);
    });
  },

  obtenerReserva(id) {
    return conProgreso(async () => {
      const instantanea = await getDoc(doc(obtenerDb(), COLECCIONES.reservas, String(id)));
      if (!instantanea.exists()) throw new ErrorDatos('La reserva no existe.', 'not-found');
      return mapearReserva(instantanea);
    });
  },

  /** Comprueba que el vehículo esté libre en el rango solicitado. */
  async verificarDisponibilidad(vehiculoId, fechaInicio, fechaFin, exceptoId = null) {
    const instantanea = await getDocs(query(
      coleccion(),
      where('vehiculoId', '==', String(vehiculoId)),
      where('estado', 'in', ESTADOS_QUE_OCUPAN)
    ));

    const conflicto = instantanea.docs
      .map(mapearReserva)
      .filter((r) => String(r.id) !== String(exceptoId))
      .find((r) => hayTraslape(fechaInicio, fechaFin, r.fechaInicio, r.fechaFin));

    return conflicto
      ? {
          disponible: false,
          motivo: `El vehículo ya está reservado del ${conflicto.fechaInicio} al ${conflicto.fechaFin}.`,
          conflicto,
        }
      : { disponible: true, motivo: null, conflicto: null };
  },

  crearReserva(datos) {
    return conProgreso(async () => {
      const vehiculoId = String(datos.vehiculoId);

      const vehiculoDoc = await getDoc(doc(obtenerDb(), COLECCIONES.vehiculos, vehiculoId));
      if (!vehiculoDoc.exists()) {
        throw new ErrorDatos('El vehículo no existe.', 'datos/vehiculo');
      }
      const vehiculo = vehiculoDoc.data();

      if (vehiculo.estado !== 'disponible') {
        throw new ErrorDatos('El vehículo no está disponible para alquiler.', 'datos/no-disponible');
      }

      const disponibilidad = await this.verificarDisponibilidad(
        vehiculoId, datos.fechaInicio, datos.fechaFin
      );
      if (!disponibilidad.disponible) {
        throw new ErrorDatos(disponibilidad.motivo, 'datos/traslape');
      }

      const tarifa = calcularTarifa(vehiculo.precioPorDia, datos.fechaInicio, datos.fechaFin);

      const reserva = {
        uid: datos.uid ?? null,
        codigo: generarCodigo(),
        vehiculoId,
        vehiculo: `${vehiculo.marca} ${vehiculo.modelo}`.trim(),
        placa: vehiculo.placa ?? '',
        cliente: String(datos.cliente || '').trim(),
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        ...tarifa,
        estado: 'pendiente',
        lugarEntrega: String(datos.lugarEntrega || 'Sucursal San Salvador').trim(),
        observaciones: String(datos.observaciones || '').trim(),
        fechaCreacion: hoy(),
        creadoEn: serverTimestamp(),
      };

      const referencia = await addDoc(coleccion(), reserva);

      await ActividadService.registrar(datos.uid, {
        accion: 'reserva_creada',
        descripcion: `Reserva ${reserva.codigo} de ${reserva.vehiculo} por ${reserva.dias} día(s).`,
        reservaId: referencia.id,
        monto: reserva.total,
      });

      return { id: referencia.id, ...reserva };
    }, { silencioso: true });
  },

  /** Cambia el estado respetando la máquina de estados del negocio. */
  cambiarEstado(id, nuevoEstado, extra = {}) {
    return conProgreso(async () => {
      const referencia = doc(obtenerDb(), COLECCIONES.reservas, String(id));
      const instantanea = await getDoc(referencia);
      if (!instantanea.exists()) throw new ErrorDatos('La reserva no existe.', 'not-found');

      const actual = mapearReserva(instantanea);

      if (!puedeTransicionar(actual.estado, nuevoEstado)) {
        throw new ErrorDatos(
          `No se puede pasar de ${actual.estado} a ${nuevoEstado}.`,
          'datos/transicion'
        );
      }

      await updateDoc(referencia, {
        estado: nuevoEstado,
        ...extra,
        actualizadoEn: serverTimestamp(),
      });

      await ActividadService.registrar(actual.uid, {
        accion: `reserva_${nuevoEstado}`,
        descripcion: `Reserva ${actual.codigo}: ${actual.estado} → ${nuevoEstado}.`,
        reservaId: String(id),
      });

      return { ...actual, estado: nuevoEstado, ...extra };
    }, { silencioso: true });
  },

  confirmar: (id) => ReservaService.cambiarEstado(id, 'confirmada'),
  iniciar: (id) => ReservaService.cambiarEstado(id, 'en_curso'),
  finalizar: (id) => ReservaService.cambiarEstado(id, 'finalizada'),
  cancelar: (id, motivoCancelacion = '') =>
    ReservaService.cambiarEstado(id, 'cancelada',
      motivoCancelacion ? { observaciones: motivoCancelacion } : {}),

  /** Mueve las fechas de una reserva que todavía no ha iniciado. */
  reprogramar(id, fechaInicio, fechaFin) {
    return conProgreso(async () => {
      const referencia = doc(obtenerDb(), COLECCIONES.reservas, String(id));
      const instantanea = await getDoc(referencia);
      if (!instantanea.exists()) throw new ErrorDatos('La reserva no existe.', 'not-found');

      const actual = mapearReserva(instantanea);
      if (!['pendiente', 'confirmada'].includes(actual.estado)) {
        throw new ErrorDatos('Solo se pueden reprogramar reservas pendientes o confirmadas.', 'datos/estado');
      }

      const disponibilidad = await this.verificarDisponibilidad(
        actual.vehiculoId, fechaInicio, fechaFin, id
      );
      if (!disponibilidad.disponible) throw new ErrorDatos(disponibilidad.motivo, 'datos/traslape');

      const tarifa = calcularTarifa(actual.tarifaDiaria, fechaInicio, fechaFin);
      await updateDoc(referencia, {
        fechaInicio, fechaFin, ...tarifa, actualizadoEn: serverTimestamp(),
      });

      await ActividadService.registrar(actual.uid, {
        accion: 'reserva_confirmada',
        descripcion: `Reserva ${actual.codigo} reprogramada del ${fechaInicio} al ${fechaFin}.`,
        reservaId: String(id),
      });

      return { ...actual, fechaInicio, fechaFin, ...tarifa };
    }, { silencioso: true });
  },

  /** Solo se eliminan reservas canceladas: el historial no se borra. */
  eliminarReserva(id) {
    return conProgreso(async () => {
      const referencia = doc(obtenerDb(), COLECCIONES.reservas, String(id));
      const instantanea = await getDoc(referencia);
      if (!instantanea.exists()) throw new ErrorDatos('La reserva no existe.', 'not-found');

      if (mapearReserva(instantanea).estado !== 'cancelada') {
        throw new ErrorDatos('Solo se pueden eliminar reservas canceladas.', 'datos/estado');
      }

      await deleteDoc(referencia);
      return { id };
    }, { silencioso: true });
  },
};

/** Cotización en el navegador, para mostrar el importe antes de confirmar. */
export function cotizarLocalmente(precioPorDia, fechaInicio, fechaFin) {
  return calcularTarifa(precioPorDia, fechaInicio, fechaFin);
}

export default ReservaService;
