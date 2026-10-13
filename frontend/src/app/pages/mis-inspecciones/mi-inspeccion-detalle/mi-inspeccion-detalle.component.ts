import {
  Component,
  OnInit,
  OnDestroy,
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectorRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  NavController,
  AlertController,
  LoadingController,
  ActionSheetController,
  ModalController,
} from '@ionic/angular/standalone';
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
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonChip,
  IonListHeader,
  IonRow,
  IonCol,
  IonBadge,
  IonText,
  IonTextarea,
} from '@ionic/angular/standalone';
import { AuthService } from '../../../services/auth.service';
import { InspeccionService } from '../../../services/inspeccion.service';
import { ApiService } from '../../../services/api.service';
import { SyncService } from '../../../services/sync.service';
import {
  Inspeccion,
  ResultadoInspeccion,
} from '../../../models/inspeccion.model';
import { environment } from '../../../../environments/environment';
import { FotoViewerModalComponent } from '../../../components/foto-viewer-modal/foto-viewer-modal.component';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cameraOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  alertCircleOutline,
  eyeOutline,
  cloudUploadOutline,
  refreshOutline,
  checkmarkOutline,
  closeOutline,
  imageOutline,
  warningOutline,
  thumbsUpOutline,
  thumbsDownOutline,
} from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { prepararFotoParaEnvio } from '../../../services/foto-upload';

interface ResultadoConRol extends ResultadoInspeccion {
  miRol: 'responsable_levantamiento' | 'visor' | 'inspector' | null;
  puedeSubirFoto: boolean;
  puedeValidar: boolean;
  puedeComentar: boolean;
}

@Component({
  selector: 'app-mi-inspeccion-detalle',
  templateUrl: './mi-inspeccion-detalle.component.html',
  styleUrls: ['./mi-inspeccion-detalle.component.scss'],
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
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonChip,
    IonListHeader,
    IonRow,
    IonCol,
    IonBadge,
    IonText,
    IonTextarea,
  ],
})
export class MiInspeccionDetalleComponent implements OnInit, OnDestroy {
  inspeccion: Inspeccion | null = null;
  resultados: ResultadoConRol[] = [];
  loading = true;
  currentUser: any;
  esInspector = false;
  fotosPendientes: Record<number, string> = {};
  guardandoFotos: Record<number, boolean> = {};
  seleccionandoFotos: Record<number, boolean> = {};
  fotosPreparadas: Record<number, string> = {};
  private destruido = false;
  comentariosBorrador: Record<number, string> = {};
  guardandoComentarios: Record<number, boolean> = {};
  erroresComentario: Record<number, string> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navController: NavController,
    private authService: AuthService,
    private inspeccionService: InspeccionService,
    private apiService: ApiService,
    private alertController: AlertController,
    private loadingController: LoadingController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
    private cdr: ChangeDetectorRef,
    private syncService: SyncService
  ) {
    addIcons({
      arrowBackOutline,
      cameraOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      alertCircleOutline,
      eyeOutline,
      cloudUploadOutline,
      refreshOutline,
      checkmarkOutline,
      closeOutline,
      imageOutline,
      warningOutline,
      thumbsUpOutline,
      thumbsDownOutline,
    });
  }

  async ngOnInit() {
    this.currentUser = await this.authService.getCurrentUser();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.cargarInspeccion(parseInt(id));
    }
  }

  async cargarInspeccion(id: number) {
    this.loading = true;
    try {
      // Cargar desde el servidor para obtener datos frescos con todas las relaciones
      this.inspeccion =
        (await this.inspeccionService.getInspeccionByIdFromServer(id)) || null;
      if (this.inspeccion) {
        this.verificarRolInspector();
        this.procesarResultados();
      }
    } catch (error) {
      console.error('Error al cargar inspección:', error);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.destruido = true;
    Object.values(this.fotosPendientes).forEach((url) => this.liberarFoto(url));
    this.fotosPendientes = {};
    this.fotosPreparadas = {};
  }

  private liberarFoto(url?: string) {
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  verificarRolInspector() {
    if (!this.inspeccion || !this.currentUser) return;

    // console.log('Verificando rol de inspector para la inspección...');
    // console.log('Inspectores de la inspección:', this.inspeccion.inspectores);
    // console.log(
    //   'Personal ID del usuario actual:',
    //   this.currentUser.personal_id
    // );

    const personalId = this.currentUser.personal_id;
    this.esInspector =
      this.inspeccion.inspectores?.some((i: any) => i.id === personalId) ||
      false;
  }

  procesarResultados() {
    if (!this.inspeccion?.resultados || !this.currentUser) {
      this.resultados = [];
      return;
    }

    const personalId = this.currentUser.personal_id;
    const esAdmin = (this.currentUser.roles || []).some((rol: any) => rol.name === 'Administrador');

    // console.log('Procesando resultados para personal ID:', personalId);
    // console.log('Resultados originales:', this.inspeccion.resultados);

    this.resultados = this.inspeccion.resultados.map((resultado) => {
      // Determinar el rol del usuario en este resultado
      // Puede subir foto si es responsable_id O está en responsablesLevantamiento
      const esResponsableDirecto = !!personalId && String(resultado.responsable_id) === String(personalId);

      // El backend puede retornar con snake_case o camelCase
      const responsablesLev =
        (resultado as any).responsables_levantamiento ||
        resultado.responsablesLevantamiento ||
        [];
      const esResponsableLevantamientoPivot = responsablesLev.some(
        (r: any) =>
          !!personalId && String(r.personal_id ?? r.pivot?.personal_id ?? r.id) === String(personalId)
      );
      const esResponsableLevantamiento =
        esResponsableDirecto || esResponsableLevantamientoPivot;

      // El backend puede retornar con snake_case o camelCase
      const visoresList = (resultado as any).visores || [];
      const esVisor = visoresList.some(
        (v: any) =>
          v.id === personalId ||
          v.personal_id === personalId ||
          v.pivot?.personal_id === personalId
      );

      let miRol: ResultadoConRol['miRol'] = null;
      if (this.esInspector) {
        miRol = 'inspector';
      } else if (esResponsableLevantamiento) {
        miRol = 'responsable_levantamiento';
      } else if (esVisor) {
        miRol = 'visor';
      }

      // Determinar si puede subir foto:
      // - Es responsable de levantamiento (responsable_id O responsablesLevantamiento)
      // - Y el resultado está en estado Pendiente
      // - Y NO hay foto subida O la foto fue rechazada
      const noHayFotoOFueRechazada =
        !resultado.registro_fotografico_final ||
        resultado.foto_final_estado === 'rechazada';

      // console.log('Resultado ID:', resultado.id);
      // console.log(
      //   'Es responsable directo (responsable_id):',
      //   esResponsableDirecto
      // );
      // console.log(
      //   'Es responsable levantamiento (pivot):',
      //   esResponsableLevantamientoPivot
      // );
      // console.log(
      //   'Es responsable de levantamiento (combinado):',
      //   esResponsableLevantamiento
      // );
      // console.log('Estado del resultado:', resultado.estado);
      // console.log(
      //   'Registro fotográfico final:',
      //   resultado.registro_fotografico_final
      // );
      // console.log('Estado de la foto final:', resultado.foto_final_estado);
      // console.log('No hay foto o fue rechazada:', noHayFotoOFueRechazada);

      const puedeSubirFoto: boolean =
        (esResponsableLevantamiento || esAdmin) &&
        resultado.estado === 'Pendiente' &&
        noHayFotoOFueRechazada;

      // console.log('Puede subir foto:', puedeSubirFoto);

      // console.log('Mi rol en este resultado:', miRol);
      // console.log('Es inspector:', this.esInspector);
      // console.log(
      //   'Puede validar:',
      //   this.esInspector &&
      //     !!resultado.registro_fotografico_final &&
      //     resultado.foto_final_estado === 'pendiente'
      // );

      // Determinar si puede validar (inspector y HAY foto Y está pendiente de revisión)
      const puedeValidar: boolean =
        this.esInspector &&
        !!resultado.registro_fotografico_final &&
        resultado.foto_final_estado === 'pendiente';

      return {
        ...resultado,
        miRol,
        puedeSubirFoto,
        puedeValidar,
        puedeComentar: esResponsableLevantamiento || esAdmin,
      } as ResultadoConRol;
    });

    // Filtrar solo los resultados donde el usuario tiene algún rol
    // (excepto si es administrador o inspector, que ve todos)
    if (!esAdmin && !this.esInspector) {
      this.resultados = this.resultados.filter((r) => r.miRol !== null);
    }
  }

  getEstadoColor(estado: string): string {
    switch (estado) {
      case 'Buena Práctica':
        return 'success';
      case 'Cumplimiento':
        return 'primary';
      case 'Pendiente':
        return 'warning';
      case 'Ejecutado':
        return 'tertiary';
      default:
        return 'medium';
    }
  }

  getFotoEstadoColor(estado?: string): string {
    switch (estado) {
      case 'aprobada':
        return 'success';
      case 'rechazada':
        return 'danger';
      case 'pendiente':
        return 'warning';
      default:
        return 'medium';
    }
  }

  getFotoEstadoTexto(estado?: string): string {
    switch (estado) {
      case 'aprobada':
        return 'Aprobada';
      case 'rechazada':
        return 'Rechazada';
      case 'pendiente':
        return 'En Revisión';
      default:
        return 'Sin foto';
    }
  }

  getRolTexto(rol: string | null): string {
    switch (rol) {
      case 'responsable_levantamiento':
        return 'Responsable de Levantamiento';
      case 'visor':
        return 'Visor';
      case 'inspector':
        return 'Inspector';
      default:
        return '';
    }
  }

  getRolColor(rol: string | null): string {
    switch (rol) {
      case 'responsable_levantamiento':
        return 'primary';
      case 'visor':
        return 'secondary';
      case 'inspector':
        return 'tertiary';
      default:
        return 'medium';
    }
  }

  async subirFoto(resultado: ResultadoConRol) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Seleccionar origen de la foto',
      buttons: [
        {
          text: 'Cámara',
          icon: 'camera-outline',
          handler: () => {
            this.tomarFoto(resultado, CameraSource.Camera);
          },
        },
        {
          text: 'Galería',
          icon: 'image-outline',
          handler: () => {
            this.tomarFoto(resultado, CameraSource.Photos);
          },
        },
        {
          text: 'Cancelar',
          icon: 'close-outline',
          role: 'cancel',
        },
      ],
    });
    await actionSheet.present();
  }

  protected capturarFoto(source: CameraSource) {
    return Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source,
    });
  }

  async tomarFoto(resultado: ResultadoConRol, source: CameraSource) {
    const id = resultado.id;
    if (!id || !resultado.puedeSubirFoto || this.guardandoFotos[id] || this.seleccionandoFotos[id]) return;
    this.seleccionandoFotos[id] = true;
    try {
      const image = await this.capturarFoto(source);
      if (image.webPath) {
        if (this.destruido) {
          this.liberarFoto(image.webPath);
          return;
        }
        this.liberarFoto(this.fotosPendientes[id]);
        this.fotosPendientes[id] = image.webPath;
        delete this.fotosPreparadas[id];
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('Error al tomar foto:', error);
    } finally {
      this.seleccionandoFotos[id] = false;
      if (!this.destruido) this.cdr.detectChanges();
    }
  }

  limpiarFotoSeleccionada(resultado: ResultadoConRol) {
    if (!this.destruido && resultado.id && !this.guardandoFotos[resultado.id]) {
      const foto = this.fotosPendientes[resultado.id];
      delete this.fotosPendientes[resultado.id];
      delete this.fotosPreparadas[resultado.id];
      // Refrescar la vista antes de liberar el archivo, incluso desde un callback fuera de Angular.
      this.cdr.detectChanges();
      this.liberarFoto(foto);
    }
  }

  protected prepararFoto(url: string) {
    return prepararFotoParaEnvio(url);
  }

  async guardarFotoSeleccionada(resultado: ResultadoConRol) {
    const id = resultado.id;
    if (!id || !resultado.puedeSubirFoto || !this.fotosPendientes[id] || this.guardandoFotos[id]) return;
    this.guardandoFotos[id] = true;
    try {
      this.cdr.detectChanges();
      const foto = this.fotosPreparadas[id] || await this.prepararFoto(this.fotosPendientes[id]);
      if (this.destruido) return;
      this.fotosPreparadas[id] = foto;
      await this.enviarFotoFinal(resultado, foto);
    } catch (error: any) {
      await this.mostrarAlerta('Error', error.message || 'No se pudo preparar la foto. Intenta nuevamente.');
    } finally {
      this.guardandoFotos[id] = false;
    }
  }

  async guardarComentario(resultado: ResultadoConRol) {
    const id = resultado.id;
    if (!id || !resultado.puedeComentar || this.guardandoComentarios[id]) return;
    const contenido = (this.comentariosBorrador[id] || '').trim();
    if (!contenido || contenido.length > 2000) {
      this.erroresComentario[id] = 'Escribe un comentario de entre 1 y 2000 caracteres.';
      return;
    }
    this.guardandoComentarios[id] = true;
    delete this.erroresComentario[id];
    try {
      const response = await this.apiService.post(`/resultados/${id}/comentarios`, { contenido });
      if (!response?.success || !response.data) throw new Error('No se pudo registrar el comentario.');
      resultado.comentarios = [...(resultado.comentarios || []), response.data];
      const original = this.inspeccion?.resultados?.find((item) => item.id === id);
      if (original) original.comentarios = resultado.comentarios;
      delete this.comentariosBorrador[id];
      if (this.inspeccion?.id) {
        try {
          await this.syncService.syncInspeccionFromServer(this.inspeccion.id);
        } catch (error) {
          console.warn('Comentario guardado; no se pudo actualizar la copia local:', error);
        }
      }
    } catch (error: any) {
      this.erroresComentario[id] = error.message || 'No se pudo guardar el comentario. Intenta nuevamente.';
    } finally {
      this.guardandoComentarios[id] = false;
    }
  }

  async enviarFotoFinal(resultado: ResultadoConRol, base64: string) {
    const loading = await this.loadingController.create({
      message: 'Subiendo foto...',
    });
    await loading.present();

    try {
      const response = await this.apiService.post(
        `/resultados/${resultado.id}/foto-final`,
        {
          foto: base64.startsWith('data:image/') ? base64 : `data:image/jpeg;base64,${base64}`,
        }
      );

      if (response && response.success) {
        const cambios: Partial<ResultadoInspeccion> = {
          registro_fotografico_final: response.data?.registro_fotografico_final,
          foto_final_estado: 'pendiente',
          foto_final_comentario: undefined,
          foto_final_aprobador_id: undefined,
          foto_final_aprobada_at: undefined,
          fotoFinalAprobador: undefined,
        };
        Object.assign(resultado, cambios, { puedeSubirFoto: false, puedeValidar: this.esInspector });
        const original = this.inspeccion?.resultados?.find((item) => item.local_id === resultado.local_id);
        if (original) Object.assign(original, cambios);
        if (resultado.id) this.limpiarFotoSeleccionadaAlGuardar(resultado.id);

        // Persistir solo los campos de la foto, conservando otros cambios locales pendientes.
        if (this.inspeccion?.local_id && resultado.local_id) {
          try {
            await this.inspeccionService.actualizarFotoFinalLocal(this.inspeccion.local_id, resultado.local_id, cambios);
          } catch (error) {
            console.warn('Foto guardada; no se pudo actualizar la copia local:', error);
          }
        }

        // Forzar detección de cambios
        this.cdr.detectChanges();

        await this.mostrarAlerta(
          'Éxito',
          'La foto ha sido subida y está pendiente de revisión por el inspector.'
        );
      } else {
        await this.mostrarAlerta('Error', response?.message || 'No se pudo guardar la foto. Puedes volver a intentarlo.');
      }
    } catch (error: any) {
      console.error('Error al subir foto:', error);
      await this.mostrarAlerta(
        'Error',
        error.message || 'No se pudo subir la foto'
      );
    } finally {
      await loading.dismiss();
    }
  }

  private limpiarFotoSeleccionadaAlGuardar(id: number) {
    this.liberarFoto(this.fotosPendientes[id]);
    delete this.fotosPendientes[id];
    delete this.fotosPreparadas[id];
  }

  async validarFoto(resultado: ResultadoConRol, aprobado: boolean) {
    const alert = await this.alertController.create({
      header: aprobado ? 'Aprobar Levantamiento' : 'Rechazar Levantamiento',
      message: aprobado
        ? '¿Confirma que el levantamiento del resultado es correcto?'
        : 'Por favor, indique el motivo del rechazo:',
      inputs: aprobado
        ? []
        : [
            {
              name: 'comentario',
              type: 'textarea',
              placeholder: 'Motivo del rechazo...',
            },
          ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Confirmar',
          handler: async (data) => {
            await this.procesarValidacion(
              resultado,
              aprobado,
              data?.comentario
            );
          },
        },
      ],
    });
    await alert.present();
  }

  async procesarValidacion(
    resultado: ResultadoConRol,
    aprobado: boolean,
    comentario?: string
  ) {
    const loading = await this.loadingController.create({
      message: 'Procesando validación...',
    });
    await loading.present();

    try {
      const response = await this.apiService.post(
        `/resultados/${resultado.id}/foto-final/validar`,
        {
          accion: aprobado ? 'aprobar' : 'rechazar',
          comentario: comentario || '',
        }
      );

      if (response && response.success) {
        const mensaje = aprobado
          ? 'El levantamiento ha sido aprobado. El resultado pasa a estado Ejecutado.'
          : 'El levantamiento ha sido rechazado. El responsable deberá subir una nueva foto.';

        // Sincronizar la inspección a IndexedDB para que otros componentes vean los cambios
        if (this.inspeccion?.id) {
          await this.syncService.syncInspeccionFromServer(this.inspeccion.id);
        }

        // Recargar la inspección
        if (this.inspeccion?.id) {
          await this.cargarInspeccion(this.inspeccion.id);
        }

        // Forzar detección de cambios
        this.cdr.detectChanges();

        await this.mostrarAlerta('Éxito', mensaje);
      }
    } catch (error: any) {
      console.error('Error al validar:', error);
      await this.mostrarAlerta(
        'Error',
        error.message || 'No se pudo procesar la validación'
      );
    } finally {
      await loading.dismiss();
    }
  }

  async mostrarAlerta(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
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
  
  async verFoto(url: string, titulo: string = 'Foto') {
    if (!url) return;

    const modal = await this.modalController.create({
      component: FotoViewerModalComponent,
      componentProps: {
        fotoUrl: url,
        titulo: titulo,
      },
      cssClass: 'foto-viewer-modal',
    });
    await modal.present();
  }

  getImageUrl(path: string): string {
    if (!path) return '';
    // Si ya es una URL completa
    if (path.startsWith('http')) return path;
    // Si es una imagen base64, devolverla tal cual
    if (path.startsWith('data:image/')) return path;
    // Si parece ser base64 sin prefijo (string largo sin extensión de archivo)
    if (path.length > 1000 && !path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return `data:image/jpeg;base64,${path}`;
    }
    // Si es una ruta de archivo, construir la URL del backend
    return `${environment.apiUrl.replace('/api/v1', '')}/storage/${path}`;
  }

  async doRefresh(event: any) {
    if (this.inspeccion?.id) {
      await this.cargarInspeccion(this.inspeccion.id);
    }
    event.target.complete();
  }

  goBack() {    
    this.router.navigate(['/mis-inspecciones']);
    // this.navController.back();
  }
}
