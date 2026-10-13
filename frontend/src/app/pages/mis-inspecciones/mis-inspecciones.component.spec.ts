import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NavController, provideIonicAngular } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import { InspeccionService } from '../../services/inspeccion.service';
import { Area, Personal } from '../../models/catalogo.model';
import { EstadoResultado, Inspeccion, ResultadoInspeccion } from '../../models/inspeccion.model';
import { MisInspeccionesComponent } from './mis-inspecciones.component';

describe('MisInspeccionesComponent', () => {
  let component: MisInspeccionesComponent;
  let fixture: ComponentFixture<MisInspeccionesComponent>;
  let inspecciones: Inspeccion[];
  let servicio: jasmine.SpyObj<InspeccionService>;
  let navegacion: jasmine.SpyObj<NavController>;

  const resultado = (estado: EstadoResultado, id: number): ResultadoInspeccion => ({
    id, local_id: `resultado-${id}`, inspeccion_id: 692, estado,
    descripcion: 'Renovar los equipos de protección personal.',
    accion_tomar: 'Verificar la reposición de EPP.',
    nivel_riesgo: 'Medio', synced: true,
    responsable: { nombres: 'ANA', apellido_paterno: 'PÉREZ' } as Personal,
  });
  const inspeccion = (id: number, cambios: Partial<Inspeccion> = {}): Inspeccion => ({
    id, server_id: id + 691, local_id: `inspeccion-${id}`, numero_registro: `SST - 2026 - ${id}`,
    user_id: 1, empresa_id: 1, fundo_id: 4, area_id: 52, tipo_inspeccion: 'No Planeada',
    synced: true, objetivo: 'Inspección de equipos de protección personal',
    fundo: { id: 4, nombre: 'PACKING', activo: true },
    area: { id: 52, name: 'MANTENIMIENTO', empresa_id: 1, activo: true },
    resultados: [resultado('Pendiente', id)], ...cambios,
  });

  beforeEach(async () => {
    inspecciones = [
      inspeccion(1, { resultados: [resultado('Pendiente', 1), resultado('Ejecutado', 2), resultado('Pendiente', 3)] }),
      inspeccion(2, { tipo_inspeccion: 'Planeada', resultados: [resultado('Ejecutado', 4)] }),
      inspeccion(3, { fundo_id: 8, fundo: { id: 8, nombre: 'FUNDO NORTE', activo: true }, area_id: 75,
        area: { id: 75, name: 'PRODUCCIÓN', empresa_id: 1, activo: true } }),
      inspeccion(4, { resultados: [resultado('Cumplimiento', 5), resultado('Buena Práctica', 6)] }),
    ];
    servicio = jasmine.createSpyObj('InspeccionService', ['getInspecciones']);
    servicio.getInspecciones.and.callFake(async () => inspecciones);
    navegacion = jasmine.createSpyObj('NavController', ['navigateForward']);
    await TestBed.configureTestingModule({
      imports: [MisInspeccionesComponent],
      providers: [
        provideIonicAngular(),
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
        { provide: NavController, useValue: navegacion },
        { provide: InspeccionService, useValue: servicio },
        { provide: AuthService, useValue: { getCurrentUser: async () => ({ roles: [{ name: 'Administrador' }] }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MisInspeccionesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('muestra los filtros y el detalle de los hallazgos y sus responsables', () => {
    const pantalla: HTMLElement = fixture.nativeElement;
    expect(pantalla.querySelectorAll('.filter-field select').length).toBe(4);
    expect(pantalla.textContent).toContain('Renovar los equipos de protección personal.');
    expect(pantalla.textContent).toContain('ANA PÉREZ');
    expect(component.totalPendientes).toBe(3);
    expect(component.inspeccionesConPendientes).toBe(2);
  });

  it('combina sede, área, tipo y estado y conserva los demás resultados de la inspección', () => {
    component.filtroSede = '4';
    component.filtroArea = '52';
    component.filtroTipo = 'No Planeada';
    component.filtroEstado = 'Pendiente';
    component.aplicarFiltros();
    expect(component.inspeccionesFiltradas.map((vista) => vista.inspeccion.id)).toEqual([1]);
    expect(component.totalPendientes).toBe(2);
    expect(component.totalResultados).toBe(3);
    expect(component.inspeccionesFiltradas[0].resumen.Ejecutado).toBe(1);
    expect(inspecciones[0].resultados?.length).toBe(3);
  });

  it('filtra cada estado por la existencia de al menos un resultado coincidente', () => {
    const esperadas: Record<EstadoResultado, number[]> = {
      Pendiente: [1, 3], Ejecutado: [1, 2], Cumplimiento: [4], 'Buena Práctica': [4],
    };
    for (const estado of component.estados) {
      component.filtroEstado = estado;
      component.aplicarFiltros();
      expect(component.inspeccionesFiltradas.map((vista) => vista.inspeccion.id)).toEqual(esperadas[estado]);
    }
  });

  it('incluye las áreas secundarias del backend y los pivotes locales sin duplicar la principal', () => {
    const secundaria: Area = { id: 90, name: 'LOGÍSTICA', empresa_id: 1, activo: true };
    inspecciones[0].areas = [inspecciones[0].area!, secundaria] as unknown as Inspeccion['areas'];
    inspecciones[1].areas = [{ local_id: 'area-pivot', inspeccion_id: 2, area_id: 90, area: secundaria }];
    component.prepararInspecciones();
    component.filtroArea = '90';
    component.aplicarFiltros();
    expect(component.inspeccionesFiltradas.map((vista) => vista.inspeccion.id)).toEqual([1, 2]);
    expect(component.areas.filter((area) => area.id === '52').length).toBe(1);
  });

  it('actualiza las áreas al cambiar de sede y limpia un área incompatible', () => {
    component.filtroArea = '52';
    component.filtroSede = '8';
    component.aplicarFiltros();
    expect(component.filtroArea).toBe('');
    expect(component.areas.map((area) => area.id)).toEqual(['75']);
    expect(component.inspeccionesFiltradas.map((vista) => vista.inspeccion.id)).toEqual([3]);
  });

  it('activa el acceso rápido a pendientes sin perder los filtros de ubicación', () => {
    component.filtroSede = '4';
    component.togglePendientes();
    expect(component.inspeccionesFiltradas.map((vista) => vista.inspeccion.id)).toEqual([1]);
    component.togglePendientes();
    expect(component.filtroSede).toBe('4');
    expect(component.inspeccionesFiltradas.length).toBe(3);
  });

  it('busca sin distinguir tildes y muestra un estado vacío que permite restablecer los filtros', () => {
    component.busqueda = 'proteccion';
    component.aplicarFiltros();
    expect(component.inspeccionesFiltradas.length).toBe(4);
    component.busqueda = 'registro inexistente';
    component.aplicarFiltros();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay coincidencias');
    component.limpiarFiltros();
    expect(component.inspeccionesFiltradas.length).toBe(4);
    expect(component.hayFiltros).toBeFalse();
  });

  it('cuenta todos los resultados aunque las tarjetas se muestren en grupos', () => {
    component.inspecciones = Array.from({ length: 25 }, (_, indice) => inspeccion(indice + 1));
    component.prepararInspecciones();
    expect(component.inspeccionesVisibles.length).toBe(12);
    expect(component.totalPendientes).toBe(25);
    component.mostrarMas();
    expect(component.inspeccionesVisibles.length).toBe(24);
    component.mostrarMas();
    expect(component.inspeccionesVisibles.length).toBe(25);
    component.aplicarFiltros();
    expect(component.inspeccionesVisibles.length).toBe(12);
  });

  it('mantiene los filtros limitados a las inspecciones autorizadas por el rol', async () => {
    inspecciones[0].resultados![0].responsable_id = 1163;
    component.currentUser = { personal_id: 1163, roles: [{ name: 'Responsable' }] };
    await component.cargarInspecciones();
    expect(component.inspeccionesFiltradas.map((vista) => vista.inspeccion.id)).toEqual([1]);
    expect(component.sedes.map((sede) => sede.id)).toEqual(['4']);
  });

  it('abre la inspección usando el ID del servidor y no el ID local', () => {
    component.verDetalle(inspecciones[0]);
    expect(navegacion.navigateForward).toHaveBeenCalledWith('/mis-inspecciones/692');
  });
});
