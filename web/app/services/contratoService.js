/**
 * Contratos en Cloud Firestore.
 *
 * El contrato se genera al confirmar una reserva y es idempotente: pedirlo
 * dos veces para la misma reserva devuelve el que ya existe, no crea uno
 * nuevo. El identificador del documento es el de la reserva, y esa
 * coincidencia es precisamente lo que garantiza la unicidad sin necesidad de
 * una transacción.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';

import { obtenerDb, COLECCIONES } from '@/app/firebase/configuracion';
import { conProgreso, ErrorDatos } from './progreso';
import { CONDICIONES_ESTANDAR, PORCENTAJE_DEPOSITO } from '@/app/lib/constantes';
import { redondear, hoy } from '@/app/lib/utilidades';
import ReservaService, { mapearReserva } from './reservaService';
import ActividadService from './actividadService';

export function mapearContrato(documento) {
  const d = documento.data();
  return {
    id: documento.id,
    numero: d.numero ?? '',
    reservaId: d.reservaId ?? documento.id,
    reservaCodigo: d.reservaCodigo ?? '',
    uid: d.uid ?? null,
    cliente: d.cliente ?? '',
    vehiculoId: d.vehiculoId ?? null,
    vehiculo: d.vehiculo ?? '',
    placa: d.placa ?? '',
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin,
    dias: Number(d.dias ?? 0),
    total: Number(d.total ?? 0),
    deposito: Number(d.deposito ?? 0),
    estado: d.estado ?? 'vigente',
    condiciones: d.condiciones ?? CONDICIONES_ESTANDAR,
    fechaEmision: d.fechaEmision ?? null,
  };
}

function coleccion() {
  return collection(obtenerDb(), COLECCIONES.contratos);
}

export const ContratoService = {
  /** filtros: { estado, uid } */
  obtenerContratos(filtros = {}) {
    return conProgreso(async () => {
      const restricciones = [];
      if (filtros.estado) restricciones.push(where('estado', '==', filtros.estado));
      if (filtros.uid) restricciones.push(where('uid', '==', filtros.uid));
      restricciones.push(orderBy('fechaEmision', 'desc'));

      const instantanea = await getDocs(query(coleccion(), ...restricciones));
      return instantanea.docs.map(mapearContrato);
    });
  },

  obtenerContrato(id) {
    return conProgreso(async () => {
      const instantanea = await getDoc(doc(obtenerDb(), COLECCIONES.contratos, String(id)));
      if (!instantanea.exists()) throw new ErrorDatos('El contrato no existe.', 'not-found');
      return mapearContrato(instantanea);
    });
  },

  /**
   * Genera el contrato de una reserva y la confirma si aún no lo estaba.
   * Si el contrato ya existía, lo devuelve sin duplicarlo.
   */
  generarDesdeReserva(reservaId) {
    return conProgreso(async () => {
      const referencia = doc(obtenerDb(), COLECCIONES.contratos, String(reservaId));
      const existente = await getDoc(referencia);
      if (existente.exists()) return mapearContrato(existente);

      const reservaDoc = await getDoc(doc(obtenerDb(), COLECCIONES.reservas, String(reservaId)));
      if (!reservaDoc.exists()) throw new ErrorDatos('La reserva no existe.', 'not-found');

      const reserva = mapearReserva(reservaDoc);
      if (reserva.estado === 'cancelada') {
        throw new ErrorDatos('No se puede emitir un contrato de una reserva cancelada.', 'datos/estado');
      }

      const contrato = {
        numero: `CT-${String(reserva.codigo).replace('RS-', '')}`,
        reservaId: String(reservaId),
        reservaCodigo: reserva.codigo,
        uid: reserva.uid,
        cliente: reserva.cliente,
        vehiculoId: reserva.vehiculoId,
        vehiculo: reserva.vehiculo,
        placa: reserva.placa,
        fechaInicio: reserva.fechaInicio,
        fechaFin: reserva.fechaFin,
        dias: reserva.dias,
        total: reserva.total,
        deposito: redondear(reserva.total * PORCENTAJE_DEPOSITO),
        estado: 'vigente',
        condiciones: CONDICIONES_ESTANDAR,
        fechaEmision: hoy(),
        creadoEn: serverTimestamp(),
      };

      await setDoc(referencia, contrato);

      if (reserva.estado === 'pendiente') {
        await ReservaService.confirmar(reservaId);
      }

      await ActividadService.registrar(reserva.uid, {
        accion: 'reserva_confirmada',
        descripcion: `Contrato ${contrato.numero} emitido para la reserva ${reserva.codigo}.`,
        reservaId: String(reservaId),
        monto: contrato.total,
      });

      return { id: String(reservaId), ...contrato };
    }, { silencioso: true });
  },

  /**
   * Cerrar o anular un contrato arrastra la reserva al estado que
   * corresponde: finalizada o cancelada. Así no quedan desincronizados.
   */
  cambiarEstado(id, estado) {
    return conProgreso(async () => {
      const referencia = doc(obtenerDb(), COLECCIONES.contratos, String(id));
      const instantanea = await getDoc(referencia);
      if (!instantanea.exists()) throw new ErrorDatos('El contrato no existe.', 'not-found');

      const actual = mapearContrato(instantanea);
      if (actual.estado !== 'vigente') {
        throw new ErrorDatos('El contrato ya no está vigente.', 'datos/estado');
      }

      await updateDoc(referencia, { estado, actualizadoEn: serverTimestamp() });

      const reserva = await getDoc(doc(obtenerDb(), COLECCIONES.reservas, actual.reservaId));
      if (reserva.exists()) {
        const estadoReserva = mapearReserva(reserva).estado;
        if (estado === 'finalizado' && estadoReserva === 'en_curso') {
          await ReservaService.finalizar(actual.reservaId);
        } else if (estado === 'anulado' && ['pendiente', 'confirmada'].includes(estadoReserva)) {
          await ReservaService.cancelar(actual.reservaId, 'Contrato anulado.');
        }
      }

      return { ...actual, estado };
    }, { silencioso: true });
  },
};

export default ContratoService;
