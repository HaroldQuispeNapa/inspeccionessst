import { Component, OnInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import {
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular/standalone';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonTitle,
  IonBadge,
  IonSearchbar,
  IonContent,
  IonChip,
  IonLabel,
  IonList,
  IonItem,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSkeletonText,
  IonSelect,
  IonSelectOption,
  IonInput,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../../../services/database.service';
import { SyncService } from '../../../services/sync.service';
import { NetworkService } from '../../../services/network.service';
import { InspeccionService } from '../../../services/inspeccion.service';
import { ApiService } from '../../../services/api.service';
import { StorageService } from '../../../services/storage.service';
import { FormsModule } from '@angular/forms';
import { Inspeccion } from '../../../models/inspeccion.model';
import { addIcons } from 'ionicons';
import { environment } from '../../../../environments/environment';
import {
  addOutline,
  syncOutline,
  searchOutline,
  cloudDoneOutline,
  cloudUploadOutline,
  cloudDownloadOutline,
  createOutline,
  calendarOutline,
  businessOutline,
  notificationsOutline,
  trashOutline,
  statsChartOutline,
  wifiOutline,
  cloudOfflineOutline,
  documentTextOutline,
  cloudDone,
  cloudUpload,
  arrowUndoOutline,
  alertCircleOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-inspeccion-lista',
  templateUrl: './inspeccion-lista.page.html',
  styleUrls: ['./inspeccion-lista.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonTitle,
    IonBadge,
    IonSearchbar,
    IonContent,
    IonChip,
    IonLabel,
    IonList,
    IonItem,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonSkeletonText,
    IonSelect,
    IonSelectOption,
    IonInput,
  ],
})
export class InspeccionListaPage implements OnInit {
  inspecciones: Inspeccion[] = [];
  inspeccionesFiltradas: Inspeccion[] = [];
  inspeccionesVisibles: Inspeccion[] = [];
  sedes: any[] = [];
  searchTerm = '';
  placaFilter = '';
  sedeFilter: number | 'all' = 'all';
  estadoFilter: 'all' | 'Pendiente' | 'Cumplimiento' | 'Ejecutado' = 'all';
  isLoadingInspecciones = false;
  private readonly pageSize = 25;
  private visibleCount = this.pageSize;
  isOnline = true; // Inicializar como true, se actualizará inmediatamente con el valor real
  isProd = environment.production;
  syncStatus = {
    total: 0,
    sincronizados: 0,
    pendientes: 0,
    error: null as string | null,
    error_detail: null as string | null,
  };
  private syncSubscription?: Subscription;
  private networkSubscription?: Subscription;

  constructor(
    private router: Router,
    private databaseService: DatabaseService,
    private syncService: SyncService,
    private networkService: NetworkService,
    private inspeccionService: InspeccionService,
    private apiService: ApiService,
    private storageService: StorageService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private authService: AuthService,
  ) {
    addIcons({
      'add-outline': addOutline,
      'sync-outline': syncOutline,
      'search-outline': searchOutline,
      'cloud-done-outline': cloudDoneOutline,
      'cloud-upload-outline': cloudUploadOutline,
      'cloud-download-outline': cloudDownloadOutline,
      'create-outline': createOutline,
      'calendar-outline': calendarOutline,
      'business-outline': businessOutline,
      'notifications-outline': notificationsOutline,
      'trash-outline': trashOutline,
      'stats-chart-outline': statsChartOutline,
      'wifi-outline': wifiOutline,
      'cloud-offline-outline': cloudOfflineOutline,
      'cloud-done': cloudDone,
      'cloud-upload': cloudUpload,
      'arrow-undo-outline': arrowUndoOutline,
      'alert-circle-outline': alertCircleOutline,
    });
  }

  async descargarPlantilla(inspeccion: Inspeccion) {
    // Construir URL pública hacia el archivo de plantilla en el backend
    const base = (window as any).envAPI_BASE || '';
    // Fallback usando environment
    let templateUrl = '';
    try {
      // environment.apiUrl suele terminar en '/public/api/v1' o similar
      // Reemplazamos '/api/v1' por '/storage/inspecciones/template/template_inspeccion.xlsx'
      // para apuntar al archivo público en el backend
      const env = environment;
      if (env && env.apiUrl) {
        // Construir endpoint que devuelve la plantilla (backend): {apiUrl}/inspecciones/{id}/template
        templateUrl =
          env.apiUrl + '/inspecciones/' + inspeccion.local_id + '/template';
        console.log(
          '🔗 URL de plantilla construida desde environment.apiUrl:',
          templateUrl,
        );
      } else {
        templateUrl = '/storage/inspecciones/template/template_inspeccion.xlsx';
      }
    } catch (e) {
      console.warn('No se pudo resolver environment, usando ruta relativa');
      templateUrl = '/storage/inspecciones/template/template_inspeccion.xlsx';
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(templateUrl, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'application/octet-stream',
        },
      });
      if (!response.ok)
        throw new Error(`Error al descargar plantilla: ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspeccion_${inspeccion.numero_registro || inspeccion.id || 'template'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al descargar plantilla:', err);
      await this.showToast('No se pudo descargar la plantilla', 'danger');
    }
  }

  async ngOnInit() {
    // Primero verificar conectividad
    await this.checkConnectivity();

    await this.loadInspecciones();
    await this.loadSyncStatus();

    // Si no hay inspecciones locales y estamos online, sincronizar automáticamente
    if (this.inspecciones.length === 0 && this.isOnline) {
      await this.sincronizarAutomatico();
    }

    this.syncSubscription = this.syncService.syncStatus$.subscribe(
      async (status: any) => {
        // Actualizar estado local con la información completa del sync
        this.syncStatus.total = status.total_registros ?? this.syncStatus.total;
        this.syncStatus.sincronizados =
          status.sincronizados ?? this.syncStatus.sincronizados;
        this.syncStatus.pendientes =
          status.pendientes ?? this.syncStatus.pendientes;
        this.syncStatus.error = status.error ?? null;
        this.syncStatus.error_detail = status.error_detail ?? null;

        // Si hubo una sincronización reciente, recargar datos locales
        if (status.lastSync) {
          await this.loadInspecciones();
          await this.loadSyncStatus();
        }
      },
    );
  }

  /**
   * Sincronización automática silenciosa para primera carga
   */
  private async sincronizarAutomatico() {
    try {
      console.log('🔄 Sincronización automática inicial...');
      await this.syncService.syncAll();
      await this.loadInspecciones();
      await this.loadSyncStatus();
      console.log('✅ Sincronización automática completada');
    } catch (error) {
      console.error('Error en sincronización automática:', error);
    }
  }

  async ionViewWillEnter() {
    await this.loadInspecciones();
    await this.loadSyncStatus();
  }

  ngOnDestroy() {
    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
    }
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
  }

  hasPermission(permission: string): boolean {
    return this.authService.hasPermission(permission);
  }

  async loadInspecciones() {
    this.isLoadingInspecciones = true;
    try {
      this.inspecciones = await this.databaseService.getInspecciones();

      // Enriquecer con nombres de catálogos
      const empresas = await this.databaseService.getEmpresas();
      const areas = await this.databaseService.getAreas();
      this.sedes = await this.databaseService.getFundos();

      this.inspecciones = await Promise.all(this.inspecciones.map(async (inspeccion) => {
        const empresa = empresas.find(
          (e: any) => e.id === inspeccion.empresa_id,
        );
        const area = areas.find((a: any) => a.id === inspeccion.area_id);
        const fundo = this.sedes.find((s: any) => s.id === inspeccion.fundo_id);
        const resultados =
          inspeccion.resultados && inspeccion.resultados.length > 0
            ? inspeccion.resultados
            : inspeccion.id
              ? await this.databaseService.getResultadosByInspeccion(
                  inspeccion.id,
                )
              : [];

        return {
          ...inspeccion,
          empresa,
          area,
          fundo: inspeccion.fundo || fundo,
          resultados,
        };
      }));

      // El orden ya lo aplica DatabaseService.getInspecciones().

      this.filterInspecciones(true);
    } catch (error) {
      console.error('Error al cargar inspecciones:', error);
      await this.showToast('Error al cargar inspecciones', 'danger');
    } finally {
      this.isLoadingInspecciones = false;
    }
  }

  async loadSyncStatus() {
    this.syncStatus.total = await this.databaseService.inspecciones.count();
    this.syncStatus.pendientes = await this.databaseService.inspecciones
      .filter((i: any) => !i.synced)
      .count();
    this.syncStatus.sincronizados =
      this.syncStatus.total - this.syncStatus.pendientes;
  }

  async checkConnectivity() {
    // Obtener valor inicial inmediatamente
    this.isOnline = this.networkService.isOnline;

    // Suscribirse a cambios futuros
    this.networkSubscription = this.networkService.isOnline$.subscribe(
      (status: boolean) => {
        this.isOnline = status;
      },
    );
  }

  filterInspecciones(resetScroll: boolean = true) {
    const term = this.searchTerm.toLowerCase().trim();
    const placa = this.placaFilter.trim().toLowerCase();

    this.inspeccionesFiltradas = this.inspecciones.filter((inspeccion) => {
      const matchesTerm =
        !term ||
        inspeccion.empresa?.name?.toLowerCase().includes(term) ||
        inspeccion.area?.name?.toLowerCase().includes(term) ||
        inspeccion.zona_inspeccionada?.toLowerCase().includes(term) ||
        inspeccion.numero_registro?.toLowerCase().includes(term) ||
        inspeccion.placa?.toLowerCase().includes(term) ||
        inspeccion.tipo_inspeccion?.toLowerCase().includes(term);
      const matchesPlaca = !placa || inspeccion.placa?.toLowerCase().includes(placa);
      const matchesSede =
        this.sedeFilter === 'all' ||
        Number(inspeccion.fundo_id) === Number(this.sedeFilter);
      const matchesEstado =
        this.estadoFilter === 'all' ||
        this.getEstadoInspeccion(inspeccion) === this.estadoFilter;

      return matchesTerm && matchesPlaca && matchesSede && matchesEstado;
    });

    if (resetScroll) {
      this.visibleCount = this.pageSize;
    }

    this.updateVisibleInspecciones();
  }

  clearFilters() {
    this.searchTerm = '';
    this.placaFilter = '';
    this.sedeFilter = 'all';
    this.estadoFilter = 'all';
    this.filterInspecciones();
  }

  onIonInfinite(event: any) {
    this.visibleCount += this.pageSize;
    this.updateVisibleInspecciones();
    event.target.complete();
    event.target.disabled = !this.hasMoreInspecciones();
  }

  private updateVisibleInspecciones() {
    this.inspeccionesVisibles = this.inspeccionesFiltradas.slice(
      0,
      this.visibleCount,
    );
  }

  hasMoreInspecciones(): boolean {
    return this.inspeccionesVisibles.length < this.inspeccionesFiltradas.length;
  }

  getEstadoInspeccion(
    inspeccion: Inspeccion,
  ): 'Pendiente' | 'Cumplimiento' | 'Ejecutado' {
    const estados = (inspeccion.resultados || []).map((r: any) => r.estado);

    if (estados.includes('Pendiente')) {
      return 'Pendiente';
    }

    if (estados.includes('Cumplimiento')) {
      return 'Cumplimiento';
    }

    if (estados.includes('Ejecutado')) {
      return 'Ejecutado';
    }

    return 'Pendiente';
  }

  async nuevaInspeccion() {
    this.router.navigate(['/inspecciones/form']);
  }

  async editarInspeccion(inspeccion: Inspeccion) {
    const id = inspeccion.id || inspeccion.local_id;
    this.router.navigate(['/inspecciones/form', id]);
  }

  async sincronizar() {
    if (!this.isOnline) {
      await this.showToast('Debes estar conectado para sincronizar', 'warning');
      return;
    }
    const loading = await this.loadingController.create({
      message: 'Sincronizando...',
    });
    await loading.present();

    try {
      const result: any = await this.syncService.syncAll();

      if (result && result.success) {
        await this.showToast('Sincronización completa', 'success');
      } else {
        // Mensajes segmentados según el tipo de fallo (agradar al usuario)
        const raw = (result?.message || '').toString();
        const lower = raw.toLowerCase();

        let mensajeUsuario = 'No se pudo completar la sincronización';

        if (
          lower.includes('no hay conexión') ||
          lower.includes('sin conexión')
        ) {
          mensajeUsuario = 'Sin conexión a internet';
        } else if (lower.includes('timeout') || lower.includes('tiemp')) {
          mensajeUsuario = 'La conexión tardó demasiado. Intenta nuevamente';
        } else if (
          lower.includes('network') ||
          lower.includes('failed to fetch')
        ) {
          mensajeUsuario = 'Error de conexión con el servidor';
        } else if (
          lower.includes('401') ||
          lower.includes('unauthorized') ||
          lower.includes('no autenticado')
        ) {
          mensajeUsuario =
            'Sesión expirada. Por favor inicia sesión nuevamente';
        } else if (lower.includes('500') || lower.includes('server')) {
          mensajeUsuario = 'Error en el servidor. Intenta más tarde';
        } else if (raw && raw.length > 0) {
          // Mensaje genérico desde el servidor
          mensajeUsuario = raw;
        }

        await this.showToast(mensajeUsuario, 'danger');
        // `syncService.syncAll()` ya actualiza `syncStatus.error` y `error_detail`,
        // por lo que el banner y el botón "Ver detalles" se activarán automáticamente.
      }

      await this.loadInspecciones();
      await this.loadSyncStatus();
    } catch (error) {
      console.error('Error al sincronizar:', error);
      await this.showToast('Error en la sincronización', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  getEstadoChip(inspeccion: Inspeccion): {
    color: string;
    text: string;
    icon?: string;
  } {
    if (inspeccion.synced) {
      return {
        color: 'success',
        text: 'Sincronizado',
        icon: 'cloud-done-outline',
      };
    }
    return {
      color: 'warning',
      text: 'Pendiente',
      icon: 'cloud-upload-outline',
    };
  }

  formatDate(date?: string): string {
    if (!date) return 'Sin fecha';
    // Eliminar sufijo 'Z' para evitar conversión UTC → local.
    // El valor almacenado ya contiene la hora Lima codificada como ISO.
    const d = new Date(date.replace(/Z$/i, ''));
    if (isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
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

  async enviarNotificaciones(inspeccion: Inspeccion) {
    if (!this.isOnline) {
      await this.showToast(
        'Debes estar conectado para enviar notificaciones',
        'warning',
      );
      return;
    }

    if (!inspeccion.synced) {
      await this.showToast(
        'La inspección debe estar sincronizada antes de enviar notificaciones',
        'warning',
      );
      return;
    }

    const alert = await this.alertController.create({
      header: 'Enviar Notificaciones',
      message:
        '¿Deseas enviar notificaciones por correo a todo el personal asignado en esta inspección?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Enviar',
          handler: async () => {
            // Ejecutar en segundo plano sin bloquear el cierre del alert
            await this.enviarNotificacionesConfirmado(inspeccion);
            return true; // Cierra el alert inmediatamente
          },
        },
      ],
    });

    await alert.present();
  }

  async undoDeleteInspeccion(inspeccion: Inspeccion) {
    try {
      await this.storageService.unmarkInspeccionAsDeleted(inspeccion.local_id);
      await this.loadInspecciones();
      await this.loadSyncStatus();
      await this.showToast('Eliminación deshecha', 'success');
    } catch (error) {
      console.error('Error al deshacer eliminación:', error);
      await this.showToast('No se pudo deshacer eliminación', 'danger');
    }
  }

  private async enviarNotificacionesConfirmado(inspeccion: Inspeccion) {
    console.log('Enviando notificaciones para inspección ID:', inspeccion.id);

    const loading = await this.loadingController.create({
      message: 'Enviando notificaciones...',
    });
    await loading.present();

    try {
      const response: any = await this.inspeccionService.enviarNotificaciones(
        inspeccion.local_id!,
      );

      await loading.dismiss();

      if (response.success) {
        await this.showToast(
          response.message || 'Notificaciones enviadas con éxito',
          'success',
        );
      } else {
        await this.showToast('Error al enviar notificaciones', 'danger');
      }
    } catch (error) {
      console.error('Error al enviar notificaciones:', error);
      await loading.dismiss();
      await this.showToast('Error al enviar notificaciones', 'danger');
    }
  }

  async eliminarInspeccion(inspeccion: Inspeccion) {
    const alert = await this.alertController.create({
      header: 'Eliminar Inspección',
      message: '¿Estás seguro que deseas eliminar esta inspección?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            await this.eliminarInspeccionConfirmado(inspeccion);
          },
        },
      ],
    });

    await alert.present();
  }

  // Método de ayuda para pruebas: simular un error de sincronización y probar el banner/alert
  simularError() {
    const sampleDetail = `Simulación de error de sincronización:\nHTTP 500 - Error interno\nRequest: POST /v1/sync/inspecciones\nResponse: {"message":"Simulated server failure","code":500}`;

    // Actualizar estado local para mostrar banner inmediatamente
    this.syncStatus.error = 'Error simulado de sincronización';
    this.syncStatus.error_detail = sampleDetail;

    // También mostrar un toast para feedback rápido
    this.showToast('Error simulado activado (ver detalles)', 'warning');
  }

  async verDetallesError() {
    const detail =
      this.syncStatus.error_detail ||
      this.syncStatus.error ||
      'Sin detalles disponibles';

    const alert = await this.alertController.create({
      header: 'Error de sincronización',
      message: `<div style="white-space:pre-wrap; max-height:400px; overflow:auto">${detail}</div>`,
      buttons: [
        {
          text: 'Copiar',
          handler: async () => {
            try {
              await navigator.clipboard.writeText(detail);
            } catch (e) {
              console.warn('No se pudo copiar al portapapeles', e);
            }
          },
        },
        {
          text: 'Cerrar',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  private async eliminarInspeccionConfirmado(inspeccion: Inspeccion) {
    try {
      // Si estamos online y la inspección ya fue sincronizada, intentar borrar en servidor
      if (this.isOnline && inspeccion.synced) {
        try {
          // Usar endpoint de sync para eliminar por local_id (se agregó en backend)
          await this.apiService.post('/sync/inspecciones/delete', {
            local_id: inspeccion.local_id,
          });

          // Eliminar localmente (usar id de IndexedDB)
          if (inspeccion.id) {
            await this.databaseService.inspecciones.delete(inspeccion.id);
          } else {
            // Si no tenemos id de indexeddb, buscar por local_id
            const local = await this.databaseService.inspecciones
              .where('local_id')
              .equals(inspeccion.local_id)
              .first();
            if (local && local.id) {
              await this.databaseService.inspecciones.delete(local.id);
            }
          }
          await this.loadInspecciones();
          await this.loadSyncStatus();
          await this.showToast('Inspección eliminada', 'success');
          return;
        } catch (apiErr) {
          console.warn(
            'No se pudo eliminar en servidor, marcando para eliminar',
            apiErr,
          );
          // Caeremos al flujo de marcar como eliminada localmente
        }
      }

      // Si estamos offline o la eliminación en servidor falló, marcar como eliminada para sincronizar luego
      await this.storageService.markInspeccionAsDeleted(inspeccion.local_id);
      await this.loadInspecciones();
      await this.loadSyncStatus();
      await this.showToast(
        'Inspección marcada para eliminación (pendiente de sincronización)',
        'warning',
      );
    } catch (error) {
      console.error('Error al eliminar inspección:', error);
      await this.showToast('Error al eliminar inspección', 'danger');
    }
  }

  private async showToast(
    message: string,
    color: string = 'dark',
    duration: number = 3000,
  ) {
    const toast = await this.toastController.create({
      message,
      duration,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
