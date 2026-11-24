# RENT SMART · Parte 5 de 5 — Contratos, reportes y panel administrativo

**Rama:** `parte-5-contratos-y-reportes`

El cierre documental y la vista de negocio: la emisión de contratos, el documento imprimible, los reportes con sus indicadores y el panel con el que la arrendadora empieza el día.

---

## Qué contiene este paquete

- `web/app/services/contratoService.js`
- `web/app/services/reporteService.js`
- `web/app/contratos/page.jsx`
- `web/app/contratos/[id]/page.jsx`
- `web/app/reportes/page.jsx`
- `web/app/admin/page.jsx`

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
git checkout -b parte-5-contratos-y-reportes

# 2. Copiar aquí el contenido de este ZIP (respetando las carpetas)

# 3. Revisar qué se va a subir antes de confirmarlo
git status
git diff

# 4. Confirmar
git add .
git commit -m "feat(contratos): emision idempotente de contratos, reportes del periodo y panel"

# 5. Subir la rama y abrir el pull request hacia main
git push -u origin parte-5-contratos-y-reportes
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
