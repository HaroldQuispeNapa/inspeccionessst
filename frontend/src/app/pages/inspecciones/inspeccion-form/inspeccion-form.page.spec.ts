import { FormBuilder } from '@angular/forms';
import { Personal } from '../../../models/catalogo.model';
import { InspeccionFormPage } from './inspeccion-form.page';

describe('InspeccionFormPage: nueva inspección y asignaciones', () => {
  let page: InspeccionFormPage;

  beforeEach(() => {
    page = new InspeccionFormPage(new FormBuilder(), {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any);
    page.initForm();
  });

  it('requiere categoría al crear y permite editar inspecciones antiguas sin categoría', () => {
    expect(page.inspeccionForm.get('categoria')?.valid).toBeFalse();
    page.inspeccionForm.patchValue({ categoria: page.categoriasInspeccion[0] });
    expect(page.inspeccionForm.get('categoria')?.valid).toBeTrue();
    page.isEditMode = true;
    page.initForm();
    expect(page.inspeccionForm.get('categoria')?.valid).toBeTrue();
  });

  it('copia solo las personas del primer hallazgo y mantiene las selecciones independientes', () => {
    page.agregarResultado();
    const primero = page.resultados[0];
    primero.responsable_id = 10;
    primero.responsable = { id: 10, nombres: 'ANA' } as Personal;
    primero.visores = [{ id: 20, nombres: 'LUIS' }] as any;
    primero.responsablesLevantamiento = [{ id: 30, nombres: 'MARÍA' }] as any;
    primero.descripcion = 'Descripción original';
    primero.accion_tomar = 'Acción original';
    primero.registro_fotografico_inicial = 'foto.jpg';
    primero.estado = 'Ejecutado';
    page.agregarResultado();
    const segundo = page.resultados[1];
    expect(segundo.responsable_id).toBe(10);
    expect(segundo.visores).toEqual(primero.visores);
    expect(segundo.responsablesLevantamiento).toEqual(primero.responsablesLevantamiento);
    expect(segundo.local_id).not.toBe(primero.local_id);
    expect(segundo.descripcion).toBe('');
    expect(segundo.accion_tomar).toBeUndefined();
    expect(segundo.registro_fotografico_inicial).toBeUndefined();
    expect(segundo.estado).toBe('Pendiente');
    segundo.responsable!.nombres = 'OTRA PERSONA';
    segundo.visores!.pop();
    expect(primero.responsable.nombres).toBe('ANA');
    expect(primero.visores!.length).toBe(1);
    // Cada nuevo resultado usa el primero, aunque cambien las selecciones del segundo.
    page.agregarResultado();
    expect(page.resultados[2].visores?.length).toBe(1);
    expect(page.resultados[2].responsable?.nombres).toBe('ANA');
  });

  it('limpia las tres asignaciones de una copia y conserva el primer resultado y el contenido del hallazgo', () => {
    page.agregarResultado();
    const primero = page.resultados[0];
    primero.responsable_id = 10;
    primero.responsable = { id: 10, nombres: 'ANA' } as Personal;
    primero.visores = [{ id: 20 }] as any;
    primero.responsablesLevantamiento = [{ id: 30 }] as any;
    page.agregarResultado();
    const copia = page.resultados[1];
    copia.descripcion = 'Hallazgo distinto';
    copia.accion_tomar = 'Reparar';
    copia.registro_fotografico_inicial = 'foto.jpg';
    page.hasUnsavedChanges = false;

    page.limpiarAsignaciones(1);

    expect(copia.responsable_id).toBeUndefined();
    expect(copia.responsable).toBeUndefined();
    expect(copia.visores).toEqual([]);
    expect(copia.responsablesLevantamiento).toEqual([]);
    expect(copia.descripcion).toBe('Hallazgo distinto');
    expect(copia.accion_tomar).toBe('Reparar');
    expect(copia.registro_fotografico_inicial).toBe('foto.jpg');
    expect(page.hasUnsavedChanges).toBeTrue();
    page.limpiarAsignaciones(0);
    expect(primero.responsable_id).toBe(10);
    expect(primero.visores?.length).toBe(1);
    expect(primero.responsablesLevantamiento?.length).toBe(1);
    page.agregarResultado();
    expect(page.resultados[2].responsable_id).toBe(10);
  });

  it('permite una placa vacía y limita su longitud a 20 caracteres', () => {
    const placa = page.inspeccionForm.get('placa')!;
    expect(placa.valid).toBeTrue();
    placa.setValue('ABC-123');
    expect(placa.valid).toBeTrue();
    placa.setValue('A'.repeat(21));
    expect(placa.hasError('maxlength')).toBeTrue();
  });

  it('guarda la placa en el registro local sin conexión y permite quitarla al editar', async () => {
    const guardar = jasmine.createSpy('saveInspeccion').and.resolveTo();
    const actualizar = jasmine.createSpy('updateInspeccion').and.resolveTo();
    (page as any).databaseService = { saveInspeccion: guardar, updateInspeccion: actualizar };
    (page as any).authService = { currentUserValue: { id: 1 } };
    (page as any).loadingController = { create: async () => ({ present: async () => {}, dismiss: async () => {} }) };
    const sincronizar = jasmine.createSpy('syncInspecciones');
    (page as any).syncService = { syncInspecciones: sincronizar };
    spyOn(page, 'guardarRelaciones').and.resolveTo();
    spyOn<any>(page, 'showToast').and.resolveTo();
    page.inspeccionForm.patchValue({ empresa_id: 1, numero_registro: 'QA-PLACA',
      categoria: page.categoriasInspeccion[0], placa: '  abc-123  ' });

    expect(await page.guardar(false)).toBeTrue();
    const registro = guardar.calls.mostRecent().args[0];
    expect(registro.placa).toBe('ABC-123');
    expect(registro.synced).toBeFalse();
    expect(sincronizar).not.toHaveBeenCalled();

    page.isEditMode = true;
    page.inspeccionOriginal = { ...registro, id: 1 };
    page.inspeccionForm.patchValue({ placa: '' });
    expect(await page.guardar(false)).toBeTrue();
    expect(actualizar.calls.mostRecent().args[0].placa).toBeNull();
  });
});
