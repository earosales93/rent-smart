# RENT SMART · Parte 2 de 5 — Autenticación con Firebase y perfiles de usuario

**Rama:** `parte-2-autenticacion`

Todo lo relacionado con la identidad del usuario: los dos proveedores de acceso, el documento de perfil en Firestore, el contexto de sesión y las pantallas de acceso, registro y recuperación en las dos plataformas.

---

## Qué contiene este paquete

- `web/app/services/authService.js`
- `web/app/services/perfilService.js`
- `web/app/services/usuarioService.js`
- `web/app/services/clienteService.js`
- `web/app/context/AuthContext.jsx`
- `web/app/components/BotonGoogle.jsx`
- `web/app/components/RutaProtegida.jsx`
- `web/app/components/Navbar.jsx`
- `web/app/login/page.jsx`
- `web/app/registro/page.jsx`
- `web/app/recuperar/page.jsx`
- `mobile/src/servicios/authService.js`
- `mobile/src/servicios/perfilService.js`
- `mobile/src/servicios/googleAuth.js`
- `mobile/src/contexto/AuthContext.jsx`
- `mobile/app/_layout.jsx`
- `mobile/app/index.jsx`
- `mobile/app/login.jsx`
- `mobile/app/registro.jsx`
- `mobile/app/recuperar.jsx`
- `mobile/app/(tabs)/perfil.jsx`
- `mobile/pruebas/autenticacion.test.js`
- `mobile/pruebas/validaciones.test.js`

Los archivos vienen con la misma ruta que tendrán en el repositorio: basta con
copiarlos sobre la carpeta del proyecto respetando las carpetas.

---

## Cómo hacer el commit

Partiendo de una copia del repositorio ya clonada:

```bash
git clone https://github.com/<usuario>/<repositorio>.git rent-smart
cd rent-smart

# 1. Crear la rama de esta parte a partir de main
git checkout main
git pull
git checkout -b parte-2-autenticacion

# 2. Copiar aquí el contenido de este ZIP (respetando las carpetas)

# 3. Revisar qué se va a subir antes de confirmarlo
git status
git diff

# 4. Confirmar
git add .
git commit -m "feat(auth): autenticacion con Firebase (correo y Google) y perfiles en Firestore"

# 5. Subir la rama y abrir el pull request hacia main
git push -u origin parte-2-autenticacion
```

### Mensaje de commit completo

Para usar el mensaje con su descripción —que es lo que conviene, porque explica
*por qué* se hizo cada cosa y no solo *qué* se hizo—, guardar el texto de
`MENSAJE_COMMIT.txt` y confirmar con:

```bash
git commit -F MENSAJE_COMMIT.txt
```

> Antes de confirmar, comprobar que **no** se incluye ningún archivo `.env` ni
> `node_modules`. El `.gitignore` de la parte 1 ya los excluye; `git status` lo
> confirma.

---

## Orden de las partes

Las cinco partes se integran en este orden, porque cada una se apoya en la
anterior:

| # | Rama | Parte |
| --- | --- | --- |
| 1 | `parte-1-base-y-firebase` | Base del proyecto, Firebase y documentación |
| 2 | `parte-2-autenticacion` | Autenticación con Firebase y perfiles de usuario |
| 3 | `parte-3-catalogo-vehiculos` | Catálogo de vehículos y disponibilidad |
| 4 | `parte-4-reservas` | Reservas, historial y bitácora de actividad |
| 5 | `parte-5-contratos-y-reportes` | Contratos, reportes y panel administrativo |

La **parte 1** debe estar en `main` antes que las demás: contiene la
configuración de Firebase, las reglas de negocio y los componentes que el resto
importa. Las partes 2 a 5 no se tocan entre sí, así que pueden trabajarse en
paralelo y fusionarse en cualquier orden una vez integrada la primera.
