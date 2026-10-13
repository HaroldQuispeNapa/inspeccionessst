import { Inspeccion } from '../../../models/inspeccion.model';
import { InspeccionListaPage } from './inspeccion-lista.page';

describe('InspeccionListaPage: filtro de placa', () => {
  let page: InspeccionListaPage;

  beforeEach(() => {
    page = new InspeccionListaPage({} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    page.inspecciones = [
      { id: 1, placa: 'ABC-123', fundo_id: 4, resultados: [{ estado: 'Pendiente' }] },
      { id: 2, placa: 'ABC-456', fundo_id: 8, resultados: [{ estado: 'Ejecutado' }] },
      { id: 3, placa: null, fundo_id: 4 },
      { id: 4, fundo_id: 4 },
    ] as Inspeccion[];
  });

  it('combina placa, sede y estado y mantiene accesibles los registros sin placa al limpiar', () => {
    page.placaFilter = '  abc  ';
    page.filterInspecciones();
    expect(page.inspeccionesFiltradas.map((inspeccion) => inspeccion.id)).toEqual([1, 2]);
    page.sedeFilter = 4;
    page.estadoFilter = 'Pendiente';
    page.filterInspecciones();
    expect(page.inspeccionesVisibles.map((inspeccion) => inspeccion.id)).toEqual([1]);
    page.placaFilter = 'inexistente';
    page.filterInspecciones();
    expect(page.inspeccionesFiltradas).toEqual([]);
    page.clearFilters();
    expect(page.placaFilter).toBe('');
    expect(page.inspeccionesFiltradas.length).toBe(4);
  });

  it('también encuentra la placa mediante la búsqueda general', () => {
    page.searchTerm = 'abc-123';
    page.filterInspecciones();
    expect(page.inspeccionesFiltradas.map((inspeccion) => inspeccion.id)).toEqual([1]);
  });
});
