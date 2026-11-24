/**
 * Clientes.
 *
 * Desde la migración a Firebase no existe una tabla de clientes separada:
 * el cliente ES el usuario de Authentication, y su ficha es el documento
 * `usuarios/{uid}` de Firestore. Este servicio lee esa colección y conserva
 * los nombres que ya usaban las pantallas.
 *
 * Solo un administrador puede listar todos los perfiles; las reglas de
 * seguridad lo imponen en el servidor.
 */

import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

import { obtenerDb, COLECCIONES } from '@/app/firebase/configuracion';
import { conProgreso } from './progreso';
import PerfilService from './perfilService';

export function mapearCliente(documento) {
  const d = documento.data();
  return {
    id: documento.id,     // es el uid de Firebase Authentication
    uid: documento.id,
    nombre: d.nombre ?? '',
    email: d.email ?? '',
    documento: d.documento ?? '',
    licencia: d.licencia ?? '',
    telefono: d.telefono ?? '',
    direccion: d.direccion ?? '',
    rol: d.rol ?? 'cliente',
    proveedor: d.proveedor ?? 'password',
  };
}

export const ClienteService = {
  /** filtros: { texto, rol }. El texto se filtra en el navegador. */
  obtenerClientes(filtros = {}) {
    return conProgreso(async () => {
      const restricciones = [];
      if (filtros.rol) restricciones.push(where('rol', '==', filtros.rol));
      restricciones.push(orderBy('nombre'));

      const instantanea = await getDocs(
        query(collection(obtenerDb(), COLECCIONES.usuarios), ...restricciones)
      );
      const lista = instantanea.docs.map(mapearCliente);

      const texto = String(filtros.texto || '').trim().toLowerCase();
      if (!texto) return lista;
      return lista.filter((c) =>
        [c.nombre, c.email, c.documento, c.telefono].join(' ').toLowerCase().includes(texto));
    });
  },

  obtenerCliente(uid) {
    return conProgreso(() => PerfilService.obtener(uid));
  },

  /**
   * El alta de clientes ocurre en el registro, que crea la cuenta en
   * Authentication. Desde el panel solo se completan sus datos.
   */
  actualizarCliente(uid, cambios) {
    return conProgreso(() => PerfilService.actualizar(uid, cambios), { silencioso: true });
  },
};

export default ClienteService;
