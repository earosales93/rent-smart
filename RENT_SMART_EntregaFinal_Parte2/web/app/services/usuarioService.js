/**
 * Compatibilidad con las pantallas que ya existían.
 *
 * Antes este servicio hablaba con /api/auth; ahora delega en Firebase
 * Authentication. Se conservan los nombres de los métodos para no tocar las
 * pantallas de acceso, registro y recuperación.
 */

import AuthService from './authService';

export const UsuarioService = {
  iniciarSesion: (email, password) => AuthService.iniciarSesion(email, password),
  registrarCliente: (datos) => AuthService.registrar(datos),
  iniciarSesionConGoogle: () => AuthService.iniciarSesionConGoogle(),

  /**
   * Firebase envía un enlace de restablecimiento al correo; ya no hay un
   * código que la aplicación tenga que verificar. El segundo paso del
   * formulario anterior desaparece.
   */
  solicitarCodigo: (email) => AuthService.recuperar(email),
  restablecerPassword: (email) => AuthService.recuperar(email),
};

export default UsuarioService;
