import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavController } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import { InspeccionService } from '../../services/inspeccion.service';
import { EstadoResultado, Inspeccion, InspeccionArea, ResultadoInspeccion } from '../../models/inspeccion.model';
import { Area, Personal } from '../../models/catalogo.model';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  documentOutline,
  chevronForwardOutline,
  chevronDownOutline,
  searchOutline,
  optionsOutline,
  locationOutline,
  calendarOutline,
  timeOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonCard,
  IonCardContent,
} from '@ionic/angular/standalone';

interface InspeccionConResultados extends Inspeccion {
  resultados?: ResultadoInspeccion[];
}

interface OpcionFiltro {
  id: string;
  nombre: string;
}

interface ResultadoVista {
  resultado: ResultadoInspeccion;
  estado: string;
  claseEstado: string;
  responsable: string;
}

interface InspeccionVista {
  inspeccion: InspeccionConResultados;
  sede: OpcionFiltro;
  areas: OpcionFiltro[];
  tipo: string;
  resumen: Record<EstadoResultado, number>;
  resultados: ResultadoVista[];
  textoBusqueda: string;
}

@Component({
  selector: 'app-mis-inspecciones',
  templateUrl: './mis-inspecciones.component.html',
  styleUrls: [
    './mis-inspecciones.component.scss',
    './mis-inspecciones-cards.scss',
    './mis-inspecciones-results.scss',
  ],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonSpinner,
    IonCard,
    IonCardContent,
  ],
})
export class MisInspeccionesComponent implements OnInit {
  inspecciones: InspeccionConResultados[] = [];
  loading = true;
  currentUser: any;
  errorCarga = '';
  busqueda = '';
  filtroSede = '';
  filtroArea = '';
  filtroTipo = '';
  filtroEstado = '';
  sedes: OpcionFiltro[] = [];
  areas: OpcionFiltro[] = [];
  tipos: string[] = [];
  inspeccionesFiltradas: InspeccionVista[] = [];
  inspeccionesVisibles: InspeccionVista[] = [];
  totalResultados = 0;
  totalPendientes = 0;
  inspeccionesConPendientes = 0;
  readonly estados: EstadoResultado[] = ['Pendiente', 'Ejecutado', 'Cumplimiento', 'Buena Práctica'];
  private inspeccionesPreparadas: InspeccionVista[] = [];
  private readonly tamanoPagina = 12;
  private limiteVisible = this.tamanoPagina;

  constructor(
    private router: Router,
    private authService: AuthService,
    private inspeccionService: InspeccionService,
    private navController: NavController
  ) {
    addIcons({
      arrowBackOutline,
      documentOutline,
      chevronForwardOutline,
      chevronDownOutline,
      searchOutline,
      optionsOutline,
      locationOutline,
      calendarOutline,
      timeOutline,
      checkmarkCircleOutline,
    });
  }

  async ngOnInit() {
    this.currentUser = await this.authService.getCurrentUser();
    await this.cargarInspecciones();
  }

  async cargarInspecciones() {
    this.loading = true;
    this.errorCarga = '';
    try {
      // Aquí implementaremos la lógica para filtrar por rol
      const todasLasInspecciones =
        await this.inspeccionService.getInspecciones();
      console.log(
        '[MisInspecciones] Inspecciones cargadas desde IndexedDB:',
        todasLasInspecciones
      );

      // solo inspecciones con resultados cargados (para mostrar conteos en la lista) y con server_id definido (para evitar inspecciones incompletas)
      const inspeccionesConResultados = todasLasInspecciones.filter(
        (inspeccion) =>
          inspeccion.resultados && inspeccion.resultados.length > 0 && inspeccion.server_id
      );

      // Filtrar según el rol del usuario
      this.inspecciones = this.filtrarInspeccionesPorRol(inspeccionesConResultados);
      console.log(
        '[MisInspecciones] Inspecciones visibles después de los filtros:',
        this.inspecciones
      );
      this.prepararInspecciones();
    } catch (error) {
      console.error('Error al cargar inspecciones:', error);
      this.errorCarga = 'No se pudieron cargar las inspecciones. Intenta nuevamente.';
    } finally {
      this.loading = false;
    }
  }

  prepararInspecciones() {
    this.inspeccionesPreparadas = this.inspecciones.map((inspeccion) => {
      const sedeId = inspeccion.fundo_id ?? inspeccion.fundo?.id;
      const sede = {
        id: sedeId == null ? 'sin-sede' : String(sedeId),
        nombre: inspeccion.fundo?.nombre || (sedeId == null ? 'Sin sede' : `Sede #${sedeId}`),
      };
      const areas = this.getAreas(inspeccion);
      const resumen: Record<EstadoResultado, number> = {
        Pendiente: 0,
        Ejecutado: 0,
        Cumplimiento: 0,
        'Buena Práctica': 0,
      };
      const resultados = (inspeccion.resultados || []).map((resultado) => {
        const estado = this.estados.find(
          (opcion) => this.normalizarTexto(opcion) === this.normalizarTexto(resultado.estado)
        );
        if (estado) resumen[estado]++;
        return {
          resultado,
          estado: estado || resultado.estado || 'Sin estado',
          claseEstado: this.normalizarTexto(estado || '').replace(/ /g, '-'),
          responsable: this.getNombrePersonal(resultado.responsable),
        };
      });
      return {
        inspeccion,
        sede,
        areas,
        tipo: inspeccion.tipo_inspeccion === 'Otro' && inspeccion.tipo_inspeccion_otro
          ? inspeccion.tipo_inspeccion_otro
          : inspeccion.tipo_inspeccion,
        resumen,
        resultados,
        textoBusqueda: this.normalizarTexto([
          inspeccion.numero_registro,
          inspeccion.empresa?.name,
          sede.nombre,
          ...areas.map((area) => area.nombre),
          inspeccion.objetivo,
          inspeccion.zona_inspeccionada,
        ].filter(Boolean).join(' ')),
      };
    });
    this.sedes = this.opcionesUnicas(this.inspeccionesPreparadas.map((vista) => vista.sede));
    this.tipos = [...new Set(this.inspecciones.map((inspeccion) => inspeccion.tipo_inspeccion))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    this.aplicarFiltros();
  }

  aplicarFiltros() {
    // Las áreas disponibles corresponden a la sede elegida.
    this.areas = this.opcionesUnicas(this.inspeccionesPreparadas
      .filter((vista) => !this.filtroSede || vista.sede.id === this.filtroSede)
      .reduce<OpcionFiltro[]>((opciones, vista) => opciones.concat(vista.areas), []));
    if (this.filtroArea && !this.areas.some((area) => area.id === this.filtroArea)) {
      this.filtroArea = '';
    }
    const busqueda = this.normalizarTexto(this.busqueda);
    this.inspeccionesFiltradas = this.inspeccionesPreparadas.filter((vista) =>
      (!this.filtroSede || vista.sede.id === this.filtroSede) &&
      (!this.filtroArea || vista.areas.some((area) => area.id === this.filtroArea)) &&
      (!this.filtroTipo || vista.inspeccion.tipo_inspeccion === this.filtroTipo) &&
      (!this.filtroEstado || vista.resultados.some((resultado) => resultado.estado === this.filtroEstado)) &&
      (!busqueda || vista.textoBusqueda.includes(busqueda))
    );
    this.totalResultados = this.inspeccionesFiltradas.reduce((total, vista) => total + vista.resultados.length, 0);
    this.totalPendientes = this.inspeccionesFiltradas.reduce((total, vista) => total + vista.resumen.Pendiente, 0);
    this.inspeccionesConPendientes = this.inspeccionesFiltradas.filter((vista) => vista.resumen.Pendiente > 0).length;
    this.limiteVisible = this.tamanoPagina;
    this.inspeccionesVisibles = this.inspeccionesFiltradas.slice(0, this.limiteVisible);
  }

  limpiarFiltros() {
    this.busqueda = '';
    this.filtroSede = '';
    this.filtroArea = '';
    this.filtroTipo = '';
    this.filtroEstado = '';
    this.aplicarFiltros();
  }

  togglePendientes() {
    this.filtroEstado = this.filtroEstado === 'Pendiente' ? '' : 'Pendiente';
    this.aplicarFiltros();
  }

  get hayFiltros(): boolean {
    return !!(this.busqueda || this.filtroSede || this.filtroArea || this.filtroTipo || this.filtroEstado);
  }

  mostrarMas() {
    this.limiteVisible += this.tamanoPagina;
    this.inspeccionesVisibles = this.inspeccionesFiltradas.slice(0, this.limiteVisible);
  }

  trackInspeccion(_index: number, vista: InspeccionVista): string {
    return vista.inspeccion.local_id;
  }

  private getAreas(inspeccion: Inspeccion): OpcionFiltro[] {
    const opciones: OpcionFiltro[] = [];
    const agregar = (id: number | null | undefined, nombre?: string) => {
      if (id != null) opciones.push({ id: String(id), nombre: nombre || `Área #${id}` });
    };
    agregar(inspeccion.area_id ?? inspeccion.area?.id, inspeccion.area?.name);
    // El servidor envía áreas directas; los registros locales también pueden incluir pivotes.
    for (const relacion of (inspeccion.areas || []) as (Area | InspeccionArea)[]) {
      if ('name' in relacion) {
        agregar(relacion.id, relacion.name);
      } else {
        agregar(relacion.area_id ?? relacion.area?.id, relacion.area?.name);
      }
    }
    return opciones.length ? this.opcionesUnicas(opciones) : [{ id: 'sin-area', nombre: 'Sin área' }];
  }

  private opcionesUnicas(opciones: OpcionFiltro[]): OpcionFiltro[] {
    const unicas = new Map<string, OpcionFiltro>();
    for (const opcion of opciones) {
      const anterior = unicas.get(opcion.id);
      if (!anterior || anterior.nombre.startsWith('Área #')) unicas.set(opcion.id, opcion);
    }
    return [...unicas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  private normalizarTexto(texto: string | undefined | null): string {
    return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  private getNombrePersonal(personal?: Personal): string {
    return personal?.name || [personal?.nombres, personal?.apellido_paterno, personal?.apellido_materno]
      .filter(Boolean).join(' ') || 'Sin responsable asignado';
  }

  formatDate(datetime?: string): string {
    if (!datetime) return 'Sin fecha';
    const fecha = new Date(datetime.replace(/Z$/i, ''));
    return isNaN(fecha.getTime()) ? 'Sin fecha' : fecha.toLocaleDateString('es-PE');
  }

  filtrarInspeccionesPorRol(
    inspecciones: Inspeccion[]
  ): InspeccionConResultados[] {
    if (!this.currentUser) return [];

    const personalId = this.currentUser.personal_id; // Usar personal_id, no user id
    const userRoles = this.currentUser.roles || [];

    console.log('Current User:', this.currentUser);
    console.log('Personal ID del usuario:', personalId);
    console.log(
      'Roles del usuario:',
      userRoles.map((r: any) => r.name)
    );

    // Si es administrador, mostrar todas
    if (userRoles.some((r: any) => r.name === 'Administrador')) {
      console.log('Usuario Administrador - mostrando todas las inspecciones');
      console.log('Total inspecciones:', inspecciones.length);
      return inspecciones;
    }

    // Si no tiene personal_id asignado, no puede ver inspecciones
    if (!personalId) {
      console.warn('El usuario no tiene personal_id asignado');
      return [];
    }

    // Filtrar según los diferentes roles
    return inspecciones.filter((inspeccion: InspeccionConResultados) => {
      // Inspector: ve inspecciones donde está como inspector
      // El backend puede retornar Personal con id o con personal_id
      const esInspector = inspeccion.inspectores?.some(
        (inspector: any) =>
          inspector.id === personalId || inspector.personal_id === personalId
      );

      // Responsable: ve resultados donde está como responsable
      const esResponsable = inspeccion.resultados?.some(
        (resultado: ResultadoInspeccion) =>
          resultado.responsable_id === personalId
      );

      // Visor: ve resultados donde está como visor
      // El backend puede retornar con snake_case o camelCase
      const esVisor = inspeccion.resultados?.some((resultado: any) => {
        const visoresList = resultado.visores || [];
        return visoresList.some(
          (visor: any) =>
            visor.id === personalId ||
            visor.personal_id === personalId ||
            visor.pivot?.personal_id === personalId
        );
      });

      // Responsable de levantamiento: ve resultados donde está como responsable de levantamiento
      // El backend puede retornar con snake_case o camelCase
      const esResponsableLevantamiento = inspeccion.resultados?.some(
        (resultado: any) => {
          const responsablesLev =
            resultado.responsables_levantamiento ||
            resultado.responsablesLevantamiento ||
            [];
          return responsablesLev.some(
            (resp: any) =>
              resp.id === personalId ||
              resp.personal_id === personalId ||
              resp.pivot?.personal_id === personalId
          );
        }
      );

      if (
        esInspector ||
        esResponsable ||
        esVisor ||
        esResponsableLevantamiento
      ) {
        console.log(`Inspección ${inspeccion.id} coincide:`, {
          esInspector,
          esResponsable,
          esVisor,
          esResponsableLevantamiento,
        });
      }

      return (
        esInspector || esResponsable || esVisor || esResponsableLevantamiento
      );
    });
  }

  getConteoEstado(inspeccion: InspeccionConResultados, estado: string): number {
    if (!inspeccion.resultados) return 0;
    return inspeccion.resultados.filter((r) => r.estado === estado).length;
  }

  verDetalle(inspeccion: Inspeccion) {
    this.navController.navigateForward(`/mis-inspecciones/${inspeccion.server_id}`);
  }

  async doRefresh(event: any) {
    await this.cargarInspecciones();
    console.log(this.inspecciones);
    event.target.complete();
  }

  goBack() {
    // this.navController.back();
    this.router.navigate(['/home']);
  }
  
  formatDateTime(datetime?: string): string {
    if (!datetime) return 'Sin fecha';
    // Eliminar sufijo 'Z' para evitar conversión UTC → local.
    // El valor almacenado ya contiene la hora Lima codificada como ISO.
    const d = new Date(datetime.replace(/Z$/i, ''));
    if (isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
