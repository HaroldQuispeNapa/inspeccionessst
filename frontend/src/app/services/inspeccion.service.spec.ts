import Dexie from 'dexie';
import { InspeccionService } from './inspeccion.service';
import { DatabaseService } from './database.service';

describe('Actualización local de la foto de un resultado', () => {
  let db: Dexie;
  let service: InspeccionService;

  beforeEach(async () => {
    db = new Dexie(`foto-cache-test-${Date.now()}-${Math.random()}`);
    db.version(1).stores({ inspecciones: '++id, local_id', resultados_inspeccion: '++id, local_id' });
    service = new InspeccionService({} as any, db as DatabaseService);
    await db.table('inspecciones').add({ local_id: 'inspeccion-1', synced: false,
      objetivo: 'Cambio local pendiente', resultados: [{ local_id: 'resultado-1', descripcion: 'Hallazgo', estado: 'Pendiente' }] });
    await db.table('resultados_inspeccion').add({ local_id: 'resultado-1', synced: false, descripcion: 'Edición offline pendiente' });
  });

  afterEach(async () => { await db.delete(); });

  it('actualiza ambas copias y conserva las ediciones pendientes de otros campos', async () => {
    await service.actualizarFotoFinalLocal('inspeccion-1', 'resultado-1', {
      registro_fotografico_final: 'inspecciones/fotos_finales/nueva.jpg', foto_final_estado: 'pendiente',
    });
    const inspeccion = await db.table('inspecciones').where('local_id').equals('inspeccion-1').first();
    const resultado = await db.table('resultados_inspeccion').where('local_id').equals('resultado-1').first();
    expect(inspeccion.resultados[0].registro_fotografico_final).toBe('inspecciones/fotos_finales/nueva.jpg');
    expect(resultado.registro_fotografico_final).toBe('inspecciones/fotos_finales/nueva.jpg');
    expect(inspeccion.objetivo).toBe('Cambio local pendiente');
    expect(resultado.descripcion).toBe('Edición offline pendiente');
    expect(resultado.synced).toBeFalse();
    expect(inspeccion.synced).toBeFalse();
  });
});
