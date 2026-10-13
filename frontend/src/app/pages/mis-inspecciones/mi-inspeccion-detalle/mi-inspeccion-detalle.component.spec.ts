import { CameraSource } from '@capacitor/camera';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgZone } from '@angular/core';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ActionSheetController, AlertController, LoadingController, ModalController, NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { AuthService } from '../../../services/auth.service';
import { InspeccionService } from '../../../services/inspeccion.service';
import { ApiService } from '../../../services/api.service';
import { SyncService } from '../../../services/sync.service';
import { Inspeccion } from '../../../models/inspeccion.model';
import { MiInspeccionDetalleComponent } from './mi-inspeccion-detalle.component';

describe('MiInspeccionDetalleComponent: fotos y comentarios', () => {
  let component: MiInspeccionDetalleComponent;
  let api: { post: jasmine.Spy };
  let sync: { syncInspeccionFromServer: jasmine.Spy };
  let inspeccionService: { actualizarFotoFinalLocal: jasmine.Spy };
  let prepararFoto: jasmine.Spy;

  beforeEach(() => {
    api = { post: jasmine.createSpy('post') };
    sync = { syncInspeccionFromServer: jasmine.createSpy('sync').and.resolveTo() };
    inspeccionService = { actualizarFotoFinalLocal: jasmine.createSpy('actualizarFotoFinalLocal').and.resolveTo() };
    const loading = { present: async () => {}, dismiss: async () => {} };
    component = new MiInspeccionDetalleComponent({} as any, {} as any, {} as any,
      {} as any, inspeccionService as any, api as any, {} as any,
      { create: async () => loading } as any, {} as any, {} as any,
      { detectChanges: () => {} } as any, sync as any);
    component.currentUser = { personal_id: 10, roles: [] };
    component.inspeccion = { id: 692, local_id: 'inspeccion-692', resultados: [{ id: 1, local_id: 'resultado-1', responsable_id: 10, estado: 'Pendiente' }] } as Inspeccion;
    component.procesarResultados();
    spyOn(component, 'mostrarAlerta').and.resolveTo();
    spyOn(component, 'cargarInspeccion').and.resolveTo();
    prepararFoto = spyOn<any>(component, 'prepararFoto').and.resolveTo('data:image/jpeg;base64,optimizada');
  });

  afterEach(() => component.ngOnDestroy());

  it('selecciona y limpia una foto sin enviarla ni eliminar la foto guardada', async () => {
    const resultado = component.resultados[0];
    resultado.registro_fotografico_final = 'foto-guardada.jpg';
    const revoke = spyOn(URL, 'revokeObjectURL');
    spyOn<any>(component, 'capturarFoto').and.resolveTo({ webPath: 'blob:foto-original', format: 'png' });
    await component.tomarFoto(resultado, CameraSource.Photos);
    expect(component.fotosPendientes[1]).toBe('blob:foto-original');
    expect(api.post).not.toHaveBeenCalled();
    expect(prepararFoto).not.toHaveBeenCalled();
    component.limpiarFotoSeleccionada(resultado);
    expect(component.fotosPendientes[1]).toBeUndefined();
    expect(resultado.registro_fotografico_final).toBe('foto-guardada.jpg');
    expect(revoke).toHaveBeenCalledWith('blob:foto-original');
  });

  it('envía la foto solo al guardar y conserva su formato', async () => {
    component.fotosPendientes[1] = 'blob:foto-original';
    prepararFoto.and.resolveTo('data:image/png;base64,imagen');
    api.post.and.resolveTo({ success: true, data: { registro_fotografico_final: 'nueva.jpg' } });
    await component.guardarFotoSeleccionada(component.resultados[0]);
    expect(api.post).toHaveBeenCalledWith('/resultados/1/foto-final', { foto: 'data:image/png;base64,imagen' });
    expect(component.fotosPendientes[1]).toBeUndefined();
    expect(component.resultados[0].foto_final_estado).toBe('pendiente');
    expect(sync.syncInspeccionFromServer).not.toHaveBeenCalled();
    expect(component.cargarInspeccion).not.toHaveBeenCalled();
    expect(inspeccionService.actualizarFotoFinalLocal).toHaveBeenCalledWith('inspeccion-692', 'resultado-1', jasmine.objectContaining({ registro_fotografico_final: 'nueva.jpg' }));
  });

  it('conserva la foto seleccionada cuando falla el envío', async () => {
    component.fotosPendientes[1] = 'blob:foto-original';
    api.post.and.rejectWith(new Error('Sin conexión'));
    await component.guardarFotoSeleccionada(component.resultados[0]);
    expect(component.fotosPendientes[1]).toBe('blob:foto-original');
    expect(component.guardandoFotos[1]).toBeFalse();
    await component.guardarFotoSeleccionada(component.resultados[0]);
    expect(prepararFoto).toHaveBeenCalledTimes(1);
  });

  it('conserva la vista previa si falla la preparación y no realiza la subida', async () => {
    component.fotosPendientes[1] = 'blob:foto-original';
    prepararFoto.and.rejectWith(new Error('Imagen no disponible'));
    await component.guardarFotoSeleccionada(component.resultados[0]);
    expect(api.post).not.toHaveBeenCalled();
    expect(component.fotosPendientes[1]).toBe('blob:foto-original');
    expect(component.guardandoFotos[1]).toBeFalse();
  });

  it('libera las vistas previas al cambiarlas y al cerrar la pantalla', async () => {
    const revoke = spyOn(URL, 'revokeObjectURL');
    component.fotosPendientes[1] = 'blob:anterior';
    component.fotosPreparadas[1] = 'data:image/jpeg;base64,anterior';
    spyOn<any>(component, 'capturarFoto').and.resolveTo({ webPath: 'blob:nueva' });
    await component.tomarFoto(component.resultados[0], CameraSource.Photos);
    expect(revoke).toHaveBeenCalledWith('blob:anterior');
    expect(component.fotosPreparadas[1]).toBeUndefined();
    component.ngOnDestroy();
    expect(revoke).toHaveBeenCalledWith('blob:nueva');
  });

  it('no trata un fallo en la caché local como un fallo en la subida completada', async () => {
    component.fotosPendientes[1] = 'blob:foto-original';
    inspeccionService.actualizarFotoFinalLocal.and.rejectWith(new Error('Caché no disponible'));
    api.post.and.resolveTo({ success: true, data: { registro_fotografico_final: 'nueva.jpg' } });
    await component.guardarFotoSeleccionada(component.resultados[0]);
    expect(component.fotosPendientes[1]).toBeUndefined();
    expect(component.mostrarAlerta).toHaveBeenCalledWith('Éxito', jasmine.any(String));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('registra comentarios por resultado y mantiene los anteriores', async () => {
    component.resultados[0].comentarios = [{ id: 1, contenido: 'Anterior' } as any];
    component.comentariosBorrador[1] = '  Trabajo realizado  ';
    api.post.and.resolveTo({ success: true, data: { id: 2, contenido: 'Trabajo realizado', user: { name: 'Ana' } } });
    await component.guardarComentario(component.resultados[0]);
    expect(api.post).toHaveBeenCalledWith('/resultados/1/comentarios', { contenido: 'Trabajo realizado' });
    expect(component.resultados[0].comentarios?.length).toBe(2);
    expect(component.comentariosBorrador[1]).toBeUndefined();
    expect(sync.syncInspeccionFromServer).toHaveBeenCalledWith(692);
  });

  it('conserva el texto y muestra un error si no se puede registrar', async () => {
    component.comentariosBorrador[1] = 'Trabajo realizado';
    api.post.and.rejectWith(new Error('Sin conexión'));
    await component.guardarComentario(component.resultados[0]);
    expect(component.comentariosBorrador[1]).toBe('Trabajo realizado');
    expect(component.erroresComentario[1]).toBe('Sin conexión');
    expect(component.guardandoComentarios[1]).toBeFalse();
  });

  it('un visor no puede comentar y un responsable de levantamiento sí', async () => {
    component.inspeccion!.resultados![0].responsable_id = 99;
    component.inspeccion!.resultados![0].visores = [{ personal_id: 10 }] as any;
    component.procesarResultados();
    expect(component.resultados[0].puedeComentar).toBeFalse();
    component.comentariosBorrador[1] = 'No permitido';
    await component.guardarComentario(component.resultados[0]);
    expect(api.post).not.toHaveBeenCalled();
    component.inspeccion!.resultados![0].responsablesLevantamiento = [{ personal_id: 10 }] as any;
    component.procesarResultados();
    expect(component.resultados[0].puedeComentar).toBeTrue();
  });
});

describe('MiInspeccionDetalleComponent: limpieza inmediata en la pantalla', () => {
  let fixture: ComponentFixture<MiInspeccionDetalleComponent>;
  let component: MiInspeccionDetalleComponent;
  let api: { post: jasmine.Spy };

  beforeEach(async () => {
    api = { post: jasmine.createSpy('post') };
    const inspeccion = {
      id: 692, local_id: 'inspeccion-692', numero_registro: 'QA-692', tipo_inspeccion: 'Planeada',
      placa: 'ABC-123',
      resultados: [{ id: 1, local_id: 'resultado-1', responsable_id: 10,
        descripcion: 'Hallazgo de prueba', estado: 'Pendiente', nivel_riesgo: 'Medio' }],
    };
    await TestBed.configureTestingModule({
      imports: [MiInspeccionDetalleComponent],
      providers: [
        provideIonicAngular(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '692' }) } } },
        { provide: Router, useValue: {} },
        { provide: NavController, useValue: {} },
        { provide: AuthService, useValue: { getCurrentUser: async () => ({ personal_id: 10, roles: [] }) } },
        { provide: InspeccionService, useValue: { getInspeccionByIdFromServer: async () => inspeccion } },
        { provide: ApiService, useValue: api },
        { provide: SyncService, useValue: {} },
        { provide: ActionSheetController, useValue: {} },
        { provide: AlertController, useValue: {} },
        { provide: LoadingController, useValue: {} },
        { provide: ModalController, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MiInspeccionDetalleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    component.fotosPendientes[1] = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
    fixture.detectChanges();
  });

  it('muestra la placa de la inspección en el resultado asignado', () => {
    const pantalla: HTMLElement = fixture.nativeElement;
    expect(pantalla.querySelector('.resultado-card ion-card-content')?.textContent).toContain('ABC-123');
  });

  it('quita la vista previa y los botones de guardar inmediatamente, incluso fuera de la zona de Angular', () => {
    const pantalla: HTMLElement = fixture.nativeElement;
    expect(pantalla.querySelector('.foto-borrador')).not.toBeNull();
    expect(pantalla.querySelector('img[alt="Foto de levantamiento"]')).not.toBeNull();
    TestBed.inject(NgZone).runOutsideAngular(() => {
      component.limpiarFotoSeleccionada(component.resultados[0]);
      // No se ejecuta detectChanges desde la prueba ni se espera otra interacción o temporizador.
      expect(pantalla.querySelector('.foto-borrador')).toBeNull();
      expect(pantalla.querySelector('img[alt="Foto de levantamiento"]')).toBeNull();
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('el botón Limpiar foto retira el borrador al hacer clic', () => {
    const pantalla: HTMLElement = fixture.nativeElement;
    const boton = pantalla.querySelector('.foto-borrador-acciones ion-button[color="medium"]') as HTMLElement;
    expect(boton).not.toBeNull();
    boton.click();
    expect(pantalla.querySelector('.foto-borrador')).toBeNull();
    expect(component.fotosPendientes[1]).toBeUndefined();
    expect(api.post).not.toHaveBeenCalled();
  });
});
