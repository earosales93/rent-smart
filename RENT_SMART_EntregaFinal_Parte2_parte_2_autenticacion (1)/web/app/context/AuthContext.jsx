'use client';

/**
 * Estado global de la sesión.
 *
 * Hasta la entrega anterior la sesión se guardaba a mano en localStorage y el
 * contexto era su única fuente de verdad. Con Firebase Authentication eso ya
 * no hace falta: el SDK persiste la sesión en IndexedDB y avisa de cada
 * cambio a través de `onAuthStateChanged`. Ese observador es ahora la única
 * fuente de verdad, y el contexto solo refleja lo que informa.
 *
 * El beneficio no es escribir menos código, sino que la pantalla nunca puede
 * contradecir a Firebase: si el token caduca, si la cuenta se desactiva o si
 * se cierra la sesión en otra pestaña, el observador dispara y la interfaz se
 * actualiza sola.
 */

import {
  createContext, useContext, useEffect, useMemo, useReducer, useCallback,
} from 'react';

import AuthService, { mapearUsuario } from '@/app/services/authService';
import PerfilService from '@/app/services/perfilService';

const estadoInicial = {
  usuario: null,
  perfil: null,
  cargando: true, // true mientras Firebase resuelve si hay sesión
  error: null,
};

function reducer(estado, accion) {
  switch (accion.tipo) {
    case 'SESION':
      return {
        usuario: accion.payload.usuario,
        perfil: accion.payload.perfil,
        cargando: false,
        error: null,
      };
    case 'SIN_SESION':
      return { usuario: null, perfil: null, cargando: false, error: null };
    case 'OCUPADO':
      return { ...estado, cargando: true, error: null };
    case 'ERROR':
      return { ...estado, cargando: false, error: accion.payload };
    default:
      return estado;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [estado, dispatch] = useReducer(reducer, estadoInicial);

  useEffect(() => {
    // Por si volvemos de un acceso con Google por redirección.
    AuthService.completarRedireccion();

    const dejarDeObservar = AuthService.observarSesion(async (usuarioFirebase) => {
      if (!usuarioFirebase) {
        dispatch({ tipo: 'SIN_SESION' });
        return;
      }
      // El rol y los datos de contacto no están en Authentication: se leen
      // del documento del usuario en Firestore.
      let perfil = null;
      try {
        perfil = await PerfilService.crearSiNoExiste(usuarioFirebase);
      } catch (e) {
        console.warn('No se pudo leer el perfil del usuario:', e);
      }
      dispatch({
        tipo: 'SESION',
        payload: { usuario: mapearUsuario(usuarioFirebase, perfil), perfil },
      });
    });

    return dejarDeObservar;
  }, []);

  /**
   * Las acciones no actualizan el estado: solo hablan con Firebase. Es el
   * observador de arriba el que informa del resultado, y por eso no hay
   * forma de que la interfaz quede desincronizada.
   */
  const iniciarSesion = useCallback(async (email, password) => {
    dispatch({ tipo: 'OCUPADO' });
    try {
      const usuario = await AuthService.iniciarSesion(email, password);
      const perfil = await PerfilService.obtener(usuario.uid);
      return mapearUsuario(usuario, perfil);
    } catch (e) {
      dispatch({ tipo: 'ERROR', payload: e.message });
      throw e;
    }
  }, []);

  const registrarse = useCallback(async (datos) => {
    dispatch({ tipo: 'OCUPADO' });
    try {
      const usuario = await AuthService.registrar(datos);
      const perfil = await PerfilService.obtener(usuario.uid);
      return mapearUsuario(usuario, perfil);
    } catch (e) {
      dispatch({ tipo: 'ERROR', payload: e.message });
      throw e;
    }
  }, []);

  const iniciarSesionConGoogle = useCallback(async () => {
    dispatch({ tipo: 'OCUPADO' });
    try {
      const usuario = await AuthService.iniciarSesionConGoogle();
      if (!usuario) return null; // se fue por redirección; vuelve recargado
      const perfil = await PerfilService.obtener(usuario.uid);
      return mapearUsuario(usuario, perfil);
    } catch (e) {
      dispatch({ tipo: 'ERROR', payload: e.message });
      throw e;
    }
  }, []);

  const recuperar = useCallback((email) => AuthService.recuperar(email), []);

  const cerrarSesion = useCallback(async () => {
    await AuthService.cerrarSesion();
  }, []);

  const actualizarPerfil = useCallback(
    async (cambios) => {
      if (!estado.usuario) return null;
      const perfil = await PerfilService.actualizar(estado.usuario.uid, cambios);
      dispatch({
        tipo: 'SESION',
        payload: { usuario: { ...estado.usuario, nombre: perfil.nombre }, perfil },
      });
      return perfil;
    },
    [estado.usuario]
  );

  const valor = useMemo(() => {
    const rol = estado.usuario ? estado.usuario.rol : null;
    return {
      ...estado,
      rol,
      autenticado: Boolean(estado.usuario),
      esAdministrador: rol === 'administrador',
      esOperador: rol === 'operador',
      esPersonal: rol === 'administrador' || rol === 'operador',
      esCliente: rol === 'cliente',
      uid: estado.usuario?.uid ?? null,
      /**
       * Compatibilidad: las pantallas escritas en la etapa anterior piden
       * `clienteId`. Ya no existe una tabla de clientes: el identificador del
       * cliente es su uid de Authentication.
       */
      clienteId: estado.usuario?.uid ?? null,
      cliente: estado.perfil,
      iniciarSesion,
      registrarse,
      iniciarSesionConGoogle,
      recuperar,
      cerrarSesion,
      actualizarPerfil,
    };
  }, [estado, iniciarSesion, registrarse, iniciarSesionConGoogle, recuperar, cerrarSesion, actualizarPerfil]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  return contexto;
}

/** Ruta de inicio según el rol: administrador/operador → panel; cliente → su portal. */
export function rutaInicioPorRol(rol) {
  if (rol === 'administrador' || rol === 'operador') return '/admin';
  if (rol === 'cliente') return '/cliente';
  return '/login';
}
