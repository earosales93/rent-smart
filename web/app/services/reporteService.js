/**
 * Reportes operativos.
 *
 * Antes los calculaba el servidor con consultas SQL agregadas (GROUP BY,
 * SUM, JOIN). Cloud Firestore no agrega del lado del servidor, así que el
 * reporte se arma aquí: se leen las reservas del período y la flota, y las
 * sumas se hacen en una sola pasada en memoria. Con el volumen de una
 * arrendadora pequeña la diferencia no se percibe, y el cálculo queda
 * expresado en el mismo lenguaje del negocio.
 *
 * La forma del objeto devuelto es idéntica a la que entregaba
 * /api/reportes, de modo que la pantalla de reportes no cambió.
 */

import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';

import { obtenerDb, COLECCIONES } from '@/app/firebase/configuracion';
import { conProgreso } from './progreso';
import { ESTADOS_FACTURABLES, ESTADOS_RESERVA } from '@/app/lib/constantes';
import { diasEntre, redondear, hoy } from '@/app/lib/utilidades';
import { mapearReserva } from './reservaService';
import { mapearVehiculo } from './vehiculoService';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** 'YYYY-MM' → 'Mar 2026'. */
function etiquetaMes(clave) {
  const [anio, mes] = clave.split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

/** Días de la reserva que caen dentro del período consultado. */
function diasEnPeriodo(reserva, desde, hasta) {
  const inicio = reserva.fechaInicio > desde ? reserva.fechaInicio : desde;
  const fin = reserva.fechaFin < hasta ? reserva.fechaFin : hasta;
  return fin <= inicio ? 0 : diasEntre(inicio, fin);
}

/** Acumula en un Map, creando la entrada la primera vez que aparece. */
function acumular(mapa, clave, inicial) {
  if (!mapa.has(clave)) mapa.set(clave, { ...inicial });
  return mapa.get(clave);
}

export const ReporteService = {
  obtenerReportes({ desde, hasta } = {}) {
    return conProgreso(async () => {
      const inicioPeriodo = desde || `${new Date().getFullYear()}-01-01`;
      const finPeriodo = hasta || hoy();
      const diasPeriodo = diasEntre(inicioPeriodo, finPeriodo);

      const db = obtenerDb();

      // Dos lecturas: la flota completa y las reservas que se solapan con el
      // período. Firestore no permite dos desigualdades sobre campos
      // distintos en la misma consulta, así que se acota por fechaInicio y el
      // otro extremo se filtra aquí.
      const [flotaDocs, reservaDocs] = await Promise.all([
        getDocs(collection(db, COLECCIONES.vehiculos)),
        getDocs(query(
          collection(db, COLECCIONES.reservas),
          where('fechaInicio', '<=', finPeriodo),
          orderBy('fechaInicio')
        )),
      ]);

      const flota = flotaDocs.docs.map(mapearVehiculo);
      const porId = new Map(flota.map((v) => [String(v.id), v]));

      const reservas = reservaDocs.docs
        .map(mapearReserva)
        .filter((r) => r.fechaFin >= inicioPeriodo);

      const facturables = reservas.filter((r) => ESTADOS_FACTURABLES.includes(r.estado));

      // ------------------------------------------------------------------
      // Una sola pasada alimenta todos los agregados del reporte.
      // ------------------------------------------------------------------
      const meses = new Map();
      const vehiculos = new Map();
      const categorias = new Map();
      const clientes = new Map();
      let totalIngresos = 0;

      facturables.forEach((r) => {
        const dias = diasEnPeriodo(r, inicioPeriodo, finPeriodo) || r.dias;
        totalIngresos += r.total;

        const claveMes = String(r.fechaInicio).slice(0, 7);
        const mes = acumular(meses, claveMes, { ingresos: 0, reservas: 0, diasRentados: 0 });
        mes.ingresos += r.total;
        mes.reservas += 1;
        mes.diasRentados += dias;

        const unidad = porId.get(String(r.vehiculoId));
        const vehiculo = acumular(vehiculos, String(r.vehiculoId), {
          nombre: r.vehiculo || (unidad ? `${unidad.marca} ${unidad.modelo}` : 'Unidad retirada'),
          placa: r.placa || unidad?.placa || '',
          categoria: unidad?.categoria || 'Sin categoría',
          reservas: 0, ingresos: 0, diasRentados: 0,
        });
        vehiculo.reservas += 1;
        vehiculo.ingresos += r.total;
        vehiculo.diasRentados += dias;

        const categoria = acumular(categorias, unidad?.categoria || 'Sin categoría',
          { reservas: 0, ingresos: 0 });
        categoria.reservas += 1;
        categoria.ingresos += r.total;

        const cliente = acumular(clientes, String(r.uid || r.cliente),
          { nombre: r.cliente || 'Cliente', reservas: 0, facturado: 0 });
        cliente.reservas += 1;
        cliente.facturado += r.total;
      });

      // Toda unidad de la flota aparece en el reporte de ocupación, también
      // las que no se rentaron: un 0 % es precisamente lo que hay que ver.
      flota.forEach((v) => {
        if (!vehiculos.has(String(v.id))) {
          vehiculos.set(String(v.id), {
            nombre: `${v.marca} ${v.modelo}`.trim(),
            placa: v.placa,
            categoria: v.categoria || 'Sin categoría',
            reservas: 0, ingresos: 0, diasRentados: 0,
          });
        }
      });

      const ingresosMensuales = [...meses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, d]) => ({
          mes,
          etiqueta: etiquetaMes(mes),
          ingresos: redondear(d.ingresos),
          reservas: d.reservas,
          diasRentados: d.diasRentados,
        }));

      const listaVehiculos = [...vehiculos.entries()].map(([vehiculoId, d]) => ({
        vehiculoId, ...d, ingresos: redondear(d.ingresos),
      }));

      const vehiculosMasSolicitados = [...listaVehiculos]
        .sort((a, b) => b.reservas - a.reservas || b.ingresos - a.ingresos);

      const ocupacion = listaVehiculos
        .map((v) => ({
          vehiculoId: v.vehiculoId,
          nombre: v.nombre,
          placa: v.placa,
          diasRentados: v.diasRentados,
          diasPeriodo: diasPeriodo,
          porcentaje: Math.min(100, Math.round((v.diasRentados / diasPeriodo) * 100)),
        }))
        .sort((a, b) => b.porcentaje - a.porcentaje);

      const porCategoria = [...categorias.entries()]
        .map(([categoria, d]) => ({ categoria, reservas: d.reservas, ingresos: redondear(d.ingresos) }))
        .sort((a, b) => b.ingresos - a.ingresos);

      const mejoresClientes = [...clientes.entries()]
        .map(([clienteId, d]) => ({ clienteId, ...d, facturado: redondear(d.facturado) }))
        .sort((a, b) => b.facturado - a.facturado)
        .slice(0, 5);

      const estadoReservas = ESTADOS_RESERVA.map((estado) => ({
        estado,
        cantidad: reservas.filter((r) => r.estado === estado).length,
      }));

      const fechaHoy = hoy();
      const rentadosHoy = reservas.filter((r) =>
        r.estado === 'en_curso' && r.fechaInicio <= fechaHoy && r.fechaFin >= fechaHoy).length;

      const ocupacionPromedio = ocupacion.length
        ? Math.round(ocupacion.reduce((s, o) => s + o.porcentaje, 0) / ocupacion.length)
        : 0;

      return {
        periodo: { desde: inicioPeriodo, hasta: finPeriodo, dias: diasPeriodo },
        resumen: {
          totalIngresos: redondear(totalIngresos),
          totalReservas: reservas.length,
          reservasFacturables: facturables.length,
          ticketPromedio: facturables.length ? redondear(totalIngresos / facturables.length) : 0,
          ocupacionPromedio,
          clientesActivos: clientes.size,
          flota: {
            total: flota.length,
            disponibles: flota.filter((v) => v.estado === 'disponible').length,
            mantenimiento: flota.filter((v) => v.estado === 'mantenimiento').length,
            noDisponibles: flota.filter((v) => v.estado === 'no_disponible').length,
            rentadosHoy,
          },
        },
        ingresosMensuales,
        vehiculosMasSolicitados,
        ocupacion,
        porCategoria,
        estadoReservas,
        mejoresClientes,
      };
    });
  },
};

/** Convierte el reporte a CSV para descargarlo desde el navegador. */
export function reporteACsv(reporte) {
  if (!reporte) return '';
  const lineas = [];

  lineas.push('RENT SMART - Reporte operativo');
  lineas.push(`Periodo,${reporte.periodo.desde},${reporte.periodo.hasta}`);
  lineas.push('');

  lineas.push('Ingresos mensuales');
  lineas.push('Mes,Ingresos,Reservas,Dias rentados');
  reporte.ingresosMensuales.forEach((m) =>
    lineas.push(`${m.etiqueta},${m.ingresos},${m.reservas},${m.diasRentados}`)
  );
  lineas.push('');

  lineas.push('Vehiculos mas solicitados');
  lineas.push('Vehiculo,Placa,Categoria,Reservas,Ingresos,Dias rentados');
  reporte.vehiculosMasSolicitados.forEach((v) =>
    lineas.push(`${v.nombre},${v.placa},${v.categoria},${v.reservas},${v.ingresos},${v.diasRentados}`)
  );
  lineas.push('');

  lineas.push('Ocupacion de la flota');
  lineas.push('Vehiculo,Placa,Dias rentados,Dias del periodo,Ocupacion %');
  reporte.ocupacion.forEach((o) =>
    lineas.push(`${o.nombre},${o.placa},${o.diasRentados},${o.diasPeriodo},${o.porcentaje}`)
  );

  return lineas.join('\n');
}

export default ReporteService;
