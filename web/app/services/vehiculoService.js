/**
 * Catálogo de vehículos en Cloud Firestore.
 *
 * Lee y escribe la colección `vehiculos`, la misma que consume la aplicación
 * móvil. Las pantallas conservan los métodos que ya usaban, así que la
 * migración desde el API REST sobre MySQL no obligó a modificarlas.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';

import { obtenerDb, COLECCIONES } from '@/app/firebase/configuracion';
import { conProgreso, ErrorDatos } from './progreso';
import { ESTADOS_QUE_OCUPAN } from '@/app/lib/constantes';
import { hayTraslape } from '@/app/lib/negocio';

/** Normaliza un documento de Firestore a la forma que esperan las pantallas. */
export function mapearVehiculo(documento) {
  const d = documento.data();
  return {
    id: documento.id,
    marca: d.marca ?? '',
    modelo: d.modelo ?? '',
    anio: Number(d.anio ?? 0),
    placa: d.placa ?? '',
    categoria: d.categoria ?? '',
    color: d.color ?? '',
    transmision: d.transmision ?? '',
    combustible: d.combustible ?? '',
    capacidad: Number(d.capacidad ?? 0),
    kilometraje: Number(d.kilometraje ?? 0),
    precioPorDia: Number(d.precioPorDia ?? 0),
    estado: d.estado ?? 'disponible',
    imagenUrl: d.imagenUrl ?? '',
    descripcion: d.descripcion ?? '',
  };
}

function coleccion() {
  return collection(obtenerDb(), COLECCIONES.vehiculos);
}

/** Identificador legible y estable, derivado de la placa. */
function idDesdePlaca(placa) {
  return String(placa).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const VehiculoService = {
  /** filtros: { estado, categoria, texto }. El texto se filtra en memoria. */
  obtenerVehiculos(filtros = {}) {
    return conProgreso(async () => {
      const restricciones = [];
      if (filtros.estado) restricciones.push(where('estado', '==', filtros.estado));
      if (filtros.categoria) restricciones.push(where('categoria', '==', filtros.categoria));
      restricciones.push(orderBy('marca'), orderBy('modelo'));

      const instantanea = await getDocs(query(coleccion(), ...restricciones));
      const lista = instantanea.docs.map(mapearVehiculo);

      // Firestore no ofrece búsqueda por subcadena; con una flota de este
      // tamaño el filtro se resuelve en el navegador, sin coste de lectura.
      const texto = String(filtros.texto || '').trim().toLowerCase();
      if (!texto) return lista;
      return lista.filter((v) =>
        [v.marca, v.modelo, v.placa, v.categoria, v.color]
          .join(' ').toLowerCase().includes(texto));
    });
  },

  obtenerVehiculo(id) {
    return conProgreso(async () => {
      const instantanea = await getDoc(doc(obtenerDb(), COLECCIONES.vehiculos, String(id)));
      if (!instantanea.exists()) throw new ErrorDatos('El vehículo no existe.', 'not-found');
      return mapearVehiculo(instantanea);
    });
  },

  /**
   * Vehículos libres en un rango de fechas, con la cotización calculada.
   * Se traen las unidades disponibles y las reservas que las ocupan, y el
   * cruce se resuelve aquí: Firestore no admite subconsultas.
   */
  buscarDisponibles({ fechaInicio, fechaFin, categoria } = {}) {
    return conProgreso(async () => {
      const restricciones = [where('estado', '==', 'disponible')];
      if (categoria) restricciones.push(where('categoria', '==', categoria));

      const unidades = (await getDocs(query(coleccion(), ...restricciones))).docs.map(mapearVehiculo);
      if (!fechaInicio || !fechaFin) return unidades;

      const ocupadas = await getDocs(query(
        collection(obtenerDb(), COLECCIONES.reservas),
        where('estado', 'in', ESTADOS_QUE_OCUPAN)
      ));

      const enConflicto = new Set(
        ocupadas.docs
          .map((d) => d.data())
          .filter((r) => hayTraslape(fechaInicio, fechaFin, r.fechaInicio, r.fechaFin))
          .map((r) => String(r.vehiculoId))
      );

      return unidades.filter((v) => !enConflicto.has(String(v.id)));
    });
  },

  crearVehiculo(vehiculo) {
    return conProgreso(async () => {
      const placa = String(vehiculo.placa || '').trim().toUpperCase();
      if (!placa) throw new ErrorDatos('La placa es obligatoria.', 'datos/placa');

      const id = idDesdePlaca(placa);
      const referencia = doc(obtenerDb(), COLECCIONES.vehiculos, id);

      if ((await getDoc(referencia)).exists()) {
        throw new ErrorDatos('Ya existe un vehículo registrado con esta placa.', 'datos/duplicado');
      }

      const datos = {
        marca: String(vehiculo.marca).trim(),
        modelo: String(vehiculo.modelo).trim(),
        anio: Number(vehiculo.anio),
        placa,
        categoria: String(vehiculo.categoria).trim(),
        color: String(vehiculo.color).trim(),
        transmision: vehiculo.transmision || 'Automática',
        combustible: vehiculo.combustible || 'Gasolina',
        capacidad: Number(vehiculo.capacidad || 5),
        kilometraje: Number(vehiculo.kilometraje || 0),
        precioPorDia: Number(vehiculo.precioPorDia),
        estado: vehiculo.estado || 'disponible',
        imagenUrl: String(vehiculo.imagenUrl || '').trim(),
        descripcion: String(vehiculo.descripcion || '').trim(),
        creadoEn: serverTimestamp(),
      };

      await setDoc(referencia, datos);
      return { id, ...datos };
    }, { silencioso: true });
  },

  actualizarVehiculo(id, vehiculo) {
    return conProgreso(async () => {
      const referencia = doc(obtenerDb(), COLECCIONES.vehiculos, String(id));
      const cambios = { ...vehiculo, actualizadoEn: serverTimestamp() };
      delete cambios.id;
      if (cambios.placa) cambios.placa = String(cambios.placa).trim().toUpperCase();
      ['anio', 'capacidad', 'kilometraje', 'precioPorDia'].forEach((c) => {
        if (cambios[c] !== undefined) cambios[c] = Number(cambios[c]);
      });

      await updateDoc(referencia, cambios);
      return mapearVehiculo(await getDoc(referencia));
    }, { silencioso: true });
  },

  /**
   * Una unidad con reservas activas no se elimina: hacerlo dejaría reservas
   * apuntando a un vehículo inexistente.
   */
  eliminarVehiculo(id) {
    return conProgreso(async () => {
      const activas = await getDocs(query(
        collection(obtenerDb(), COLECCIONES.reservas),
        where('vehiculoId', '==', String(id)),
        where('estado', 'in', ESTADOS_QUE_OCUPAN)
      ));

      if (!activas.empty) {
        throw new ErrorDatos(
          'No se puede eliminar: el vehículo tiene reservas activas.',
          'datos/en-uso'
        );
      }

      await deleteDoc(doc(obtenerDb(), COLECCIONES.vehiculos, String(id)));
      return { id };
    }, { silencioso: true });
  },

  cambiarEstado(id, estado) {
    return this.actualizarVehiculo(id, { estado });
  },

  async obtenerCategorias() {
    const lista = await this.obtenerVehiculos();
    return [...new Set(lista.map((v) => v.categoria))].filter(Boolean).sort();
  },
};

export default VehiculoService;
