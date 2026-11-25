/**
 * Autenticación de la versión web sobre Firebase Authentication.
 *
 * Mismos proveedores que la aplicación móvil —correo y contraseña, y Google—
 * contra el mismo proyecto, de modo que una cuenta creada en el teléfono
 * entra en la web y viceversa.
 *
 * La diferencia técnica con el móvil está en el acceso con Google: en el
 * navegador se resuelve con una ventana emergente (`signInWithPopup`), sin
 * necesidad de expo-auth-session. Si el navegador bloquea las ventanas
 * emergentes, se recurre a la redirección.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';

import { obtenerAuth } from '@/app/firebase/configuracion';
import PerfilService from './perfilService';

/** Traduce los códigos de Firebase a mensajes que una persona entiende. */
const MENSAJES = {
  'auth/invalid-email': 'El correo no tiene un formato válido.',
  'auth/user-disabled': 'La cuenta está desactivada. Contacta al administrador.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/email-already-in-use': 'Ya existe una cuenta registrada con este correo.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos fallidos. Espera unos minutos.',
  'auth/network-request-failed': 'No hay conexión con Firebase. Revisa tu red.',
  'auth/operation-not-allowed': 'El método de acceso no está habilitado en la consola de Firebase.',
  'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de terminar.',
  'auth/cancelled-popup-request': 'Se canceló el acceso con Google.',
  'auth/unauthorized-domain':
    'Este dominio no está autorizado en Firebase. Agrégalo en Authentication → Settings → Authorized domains.',
  'auth/account-exists-with-different-credential':
    'Ese correo ya está registrado con otro método de acceso.',
};

export class ErrorAuth extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorAuth';
    this.codigo = codigo;
  }
}

export function traducirError(error) {
  const codigo = error?.code || 'desconocido';
  return new ErrorAuth(
    codigo,
    MENSAJES[codigo] || 'No se pudo completar la operación. Inténtalo de nuevo.'
  );
}

/** Forma del usuario que consumen las pantallas, independiente de Firebase. */
export function mapearUsuario(usuarioFirebase, perfil = null) {
  if (!usuarioFirebase) return null;
  return {
    uid: usuarioFirebase.uid,
    email: usuarioFirebase.email,
    nombre: perfil?.nombre || usuarioFirebase.displayName || usuarioFirebase.email,
    foto: usuarioFirebase.photoURL || null,
    proveedor: usuarioFirebase.providerData?.[0]?.providerId || 'password',
    correoVerificado: usuarioFirebase.emailVerified,
    rol: perfil?.rol || 'cliente',
  };
}

export const AuthService = {
  observarSesion(callback) {
    return onAuthStateChanged(obtenerAuth(), callback);
  },

  async iniciarSesion(email, password) {
    try {
      const credencial = await signInWithEmailAndPassword(
        obtenerAuth(),
        String(email).trim().toLowerCase(),
        password
      );
      return credencial.user;
    } catch (e) {
      throw traducirError(e);
    }
  },

  async registrar({ nombre, email, password, documento, licencia, telefono, direccion }) {
    try {
      const credencial = await createUserWithEmailAndPassword(
        obtenerAuth(),
        String(email).trim().toLowerCase(),
        password
      );

      await updateProfile(credencial.user, { displayName: String(nombre).trim() });

      await PerfilService.crearSiNoExiste(credencial.user, {
        nombre: String(nombre).trim(),
        documento: String(documento || '').trim(),
        licencia: String(licencia || '').trim(),
        telefono: String(telefono || '').trim(),
        direccion: String(direccion || '').trim(),
      });

      return credencial.user;
    } catch (e) {
      throw traducirError(e);
    }
  },

  /**
   * Acceso con Google. Se intenta primero con ventana emergente, que es la
   * experiencia más fluida; si el navegador la bloquea, se cae a la
   * redirección de página completa.
   */
  async iniciarSesionConGoogle() {
    const proveedor = new GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });

    try {
      const resultado = await signInWithPopup(obtenerAuth(), proveedor);
      await PerfilService.crearSiNoExiste(resultado.user, {
        nombre: resultado.user.displayName || resultado.user.email,
      });
      return resultado.user;
    } catch (e) {
      if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-environment') {
        await signInWithRedirect(obtenerAuth(), proveedor);
        return null; // la página se recarga y termina en completarRedireccion()
      }
      throw traducirError(e);
    }
  },

  /** Se llama al cargar la aplicación, por si se volvió de una redirección. */
  async completarRedireccion() {
    try {
      const resultado = await getRedirectResult(obtenerAuth());
      if (!resultado?.user) return null;
      await PerfilService.crearSiNoExiste(resultado.user, {
        nombre: resultado.user.displayName || resultado.user.email,
      });
      return resultado.user;
    } catch {
      return null;
    }
  },

  async recuperar(email) {
    try {
      await sendPasswordResetEmail(obtenerAuth(), String(email).trim().toLowerCase());
      return true;
    } catch (e) {
      // No se revela si el correo existe: decirlo permitiría averiguar
      // qué cuentas están registradas en el sistema.
      if (e?.code === 'auth/user-not-found') return true;
      throw traducirError(e);
    }
  },

  async cerrarSesion() {
    try {
      await signOut(obtenerAuth());
    } catch (e) {
      throw traducirError(e);
    }
  },

  usuarioActual() {
    return obtenerAuth().currentUser;
  },
};

export default AuthService;
