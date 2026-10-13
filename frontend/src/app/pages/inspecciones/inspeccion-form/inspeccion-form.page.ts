import {
  Component,
  OnInit,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormArray,
  FormsModule,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  ToastController,
  LoadingController,
  AlertController,
  ModalController,
  ActionSheetController,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  IonChip,
  IonThumbnail,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonAccordionGroup,
  IonAccordion,
  IonSpinner,
  IonNote,
  IonBackButton,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { DatabaseService } from '../../../services/database.service';
import { SyncService } from '../../../services/sync.service';
import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { NetworkService } from '../../../services/network.service';
import { InspeccionService } from '../../../services/inspeccion.service';
import {
  Inspeccion,
  TipoInspeccion,
  CategoriaInspeccion,
  ResultadoInspeccion,
  NivelRiesgo,
  EstadoResultado,
  InspeccionArea,
  InspeccionInspector,
} from '../../../models/inspeccion.model';
import { Empresa, Area, Personal } from '../../../models/catalogo.model';
import { environment } from '../../../../environments/environment';
import { v4 as uuidv4 } from 'uuid';
import { addIcons } from 'ionicons';
import {
  saveOutline,
  closeOutline,
  addOutline,
  trashOutline,
  cameraOutline,
  imagesOutline,
  searchOutline,
  checkmarkCircleOutline,
  checkmarkCircle,
  chevronForwardOutline,
  constructOutline,
  eyeOutline,
  personOutline,
  businessOutline,
  peopleOutline,
  clipboardOutline,
  closeCircleOutline,
  closeCircle,
  time,
} from 'ionicons/icons';
import { AreaSelectionModalComponent } from './area-selection-modal/area-selection-modal.component';
import { InspectorSelectionModalComponent } from './inspector-selection-modal/inspector-selection-modal.component';
import { SignaturePadComponent } from '../../../components/signature-pad/signature-pad.component';

@Component({
  selector: 'app-inspeccion-form',
  templateUrl: './inspeccion-form.page.html',
  styleUrls: ['./inspeccion-form.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonChip,
    IonThumbnail,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonNote,
    IonBackButton,
    SignaturePadComponent,
  ],
})
export class InspeccionFormPage implements OnInit {
  inspeccionForm!: FormGroup;
  empresas: Empresa[] = [];
  areas: Area[] = [];
  areasFiltradas: Area[] = [];
  sedes: any[] = [];
  personalList: Personal[] = [];

  isOnline = false;
  isEditMode = false;
  inspeccionId: string | null = null;
  inspeccionOriginal: Inspeccion | null = null;

  tiposInspeccion: TipoInspeccion[] = ['Planeada', 'No Planeada', 'Otro'];
  categoriasInspeccion: CategoriaInspeccion[] = [
    'Inspecciones de maquinaria agrícola',
    'Inspección del CSST',
    'Inspección de actos y condiciones inseguras',
    'Inspección de luces de emergencia',
    'Inspección de duchas y lavaojos de emergencia',
    'Inspección de sistema de lucha contra incendios',
    'Inspección de manejo de agroquímicos',
    'Inspección de instalaciones eléctricas',
    'Inspección de uso de EPPs',
    'Inspección de buses de transporte de personal',
    'Inspección de equipos de altura (arnés, líneas de vida)',
    'Inspecciones internas de Seguridad y Salud en el Trabajo',
  ];
  nivelesRiesgo: NivelRiesgo[] = ['Alto', 'Medio', 'Bajo'];
  estadosResultado: EstadoResultado[] = [
    'Buena Práctica',
    'Cumplimiento',
    'Pendiente',
    'Ejecutado',
  ];

  // Arrays para gestionar selecciones múltiples
  areasSeleccionadas: Area[] = [];
  inspectoresSeleccionados: Personal[] = [];
  resultados: ResultadoInspeccion[] = [];

  // Firmas de inspectores: { personal_id: { fecha_firma, firma_digital } }
  firmasInspectores: Record<
    number,
    { fecha_firma?: string; firma_digital?: string }
  > = {};
  hasUnsavedChanges = false;
  private isSaving = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private databaseService: DatabaseService,
    private syncService: SyncService,
    private apiService: ApiService,
    private authService: AuthService,
    private networkService: NetworkService,
    private inspeccionService: InspeccionService,
    private toastController: ToastController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController,
    private modalController: ModalController,
  ) {
    addIcons({
      'save-outline': saveOutline,
      'close-outline': closeOutline,
      'add-outline': addOutline,
      'trash-outline': trashOutline,
      'camera-outline': cameraOutline,
      'images-outline': imagesOutline,
      'search-outline': searchOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'checkmark-circle': checkmarkCircle,
      'chevron-forward-outline': chevronForwardOutline,
      'construct-outline': constructOutline,
      'eye-outline': eyeOutline,
      'person-outline': personOutline,
      'business-outline': businessOutline,
      'people-outline': peopleOutline,
      'clipboard-outline': clipboardOutline,
      'close-circle-outline': closeCircleOutline,
      'close-circle': closeCircle,
      time: time,
    });
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode = true;
      this.inspeccionId = id;
    }

    this.initForm();
    await this.loadCatalogos();
    this.checkConnectivity();

    if (this.isEditMode && this.inspeccionId) {
      await this.loadInspeccion(this.inspeccionId);
    }
  }

  // Devuelve un ISO string usando el offset UTC-5 por defecto
  private getDefaultDateForUtcOffset(offsetHours: number = -5): string {
    const now = new Date();
    // UTC time in ms
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    // desired time in ms
    const desired = new Date(utc + offsetHours * 3600000);
    return desired.toISOString();
  }

  initForm() {
    // Inicializar con fecha actual en UTC-5 solo si NO estamos en modo edición
    const now = this.isEditMode
      ? undefined
      : this.getDefaultDateForUtcOffset(-5);

    this.inspeccionForm = this.fb.group({
      empresa_id: ['', Validators.required],
      fundo_id: [''],
      tipo_inspeccion: ['Planeada', Validators.required],
      categoria: ['', this.isEditMode ? [] : [Validators.required]],
      placa: ['', Validators.maxLength(20)],
      tipo_inspeccion_otro: [''],
      vigencia_desde: [now],
      vigencia_hasta: [now],
      zona_inspeccionada: [''],
      numero_registro: ['', Validators.required],
      fecha_hora_inspeccion: [now],
      comentario: [''],
      objetivo: [''],
      descripcion_causa: [''],
      conclusiones_recomendaciones: [''],
    });

    // Listener para filtrar áreas cuando cambia la empresa
    this.inspeccionForm
      .get('empresa_id')
      ?.valueChanges.subscribe((empresaId) => {
        this.filterAreas(empresaId);
        // Limpiar áreas seleccionadas si cambia la empresa
        this.areasSeleccionadas = this.areasSeleccionadas.filter(
          (area) => area.empresa_id === empresaId,
        );
      });

    // Listener para habilitar/deshabilitar campo "otro"
    this.inspeccionForm
      .get('tipo_inspeccion')
      ?.valueChanges.subscribe((tipo) => {
        const otroControl = this.inspeccionForm.get('tipo_inspeccion_otro');
        if (tipo === 'Otro') {
          otroControl?.setValidators([Validators.required]);
        } else {
          otroControl?.clearValidators();
          otroControl?.setValue('');
        }
        otroControl?.updateValueAndValidity();
      });

    this.inspeccionForm.valueChanges.subscribe(() => {
      if (!this.isSaving) {
        this.hasUnsavedChanges = true;
      }
    });
  }

  /**
   * Mostrar action sheet para seleccionar origen de la foto (Cámara o Galería)
   */
  async openPhotoSourceModal(
    resultado: ResultadoInspeccion,
    tipo: 'inicial' | 'final',
  ) {
    const actionSheet = await this.actionSheetController.create({
      header: 'Seleccionar origen',
      buttons: [
        {
          text: 'Cámara',
          icon: 'camera-outline',
          handler: () => this.tomarFoto(resultado, tipo, 'camera'),
        },
        {
          text: 'Galería',
          icon: 'images-outline',
          handler: () => this.tomarFoto(resultado, tipo, 'gallery'),
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

  async loadCatalogos() {
    const loading = await this.loadingController.create({
      message: 'Cargando datos...',
    });
    await loading.present();

    try {
      this.empresas = await this.databaseService.getEmpresas();
      this.areas = await this.databaseService.getAreas();
      this.sedes = await this.databaseService.getFundos();
      this.personalList = await this.databaseService.personal.toArray();

      // Si está online y no hay datos, descargar del servidor
      if (this.isOnline && this.empresas.length === 0) {
        await this.syncService.downloadCatalogos();
        this.empresas = await this.databaseService.getEmpresas();
        this.areas = await this.databaseService.getAreas();
        this.sedes = await this.databaseService.getFundos();
        this.personalList = await this.databaseService.personal.toArray();
      }
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      await this.showToast('Error al cargar catálogos', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  checkConnectivity() {
    this.networkService.isOnline$.subscribe((status: boolean) => {
      this.isOnline = status;
    });
  }

  filterAreas(empresaId: number) {
    if (empresaId) {
      this.areasFiltradas = this.areas.filter(
        //filtro por idempresa y por áreas activas
        (area) => area.empresa_id === empresaId && area.activo,
      );
    } else {
      this.areasFiltradas = [];
    }
  }

  async loadInspeccion(id: string) {
    const loading = await this.loadingController.create({
      message: 'Cargando inspección...',
    });
    await loading.present();

    try {
      // Si estamos online, refrescar la inspección desde el servidor antes de cargar
      // SOLO si la inspección local ya está sincronizada (synced: true).
      // Si tiene cambios pendientes (synced: false), no sobreescribir con datos del servidor.
      if (this.isOnline) {
        // Determinar el local_id: si el id parece UUID lo usamos directamente,
        // si no, buscamos primero en IndexedDB para obtener el local_id
        let localIdParaRefresh = id;
        let inspeccionLocal: any = null;
        const esUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          );
        if (!esUuid) {
          inspeccionLocal = await this.databaseService.inspecciones.get(
            Number(id),
          );
          if (inspeccionLocal?.local_id) {
            localIdParaRefresh = inspeccionLocal.local_id;
          }
        } else {
          // Buscar por local_id para verificar el estado de synced
          const todas = await this.databaseService.inspecciones.toArray();
          inspeccionLocal = todas.find((i: any) => i.local_id === id);
        }

        // Solo refrescar si la inspección local ya está sincronizada
        if (inspeccionLocal?.synced === false) {
          console.log(
            '⚠️ Inspección tiene cambios pendientes (synced: false), no se sobreescribe con datos del servidor',
          );
        } else {
          try {
            loading.message = 'Actualizando desde el servidor...';
            const refreshed =
              await this.syncService.refreshSingleInspeccion(
                localIdParaRefresh,
              );
            if (refreshed) {
              console.log(
                '✅ Inspección actualizada desde el servidor antes de cargar',
              );
            }
          } catch (refreshError) {
            console.warn(
              'No se pudo refrescar desde el servidor, usando datos locales:',
              refreshError,
            );
          }
        }
      }

      loading.message = 'Cargando inspección...';

      const inspecciones = await this.databaseService.getInspecciones();
      const inspeccion = inspecciones.find(
        (i: Inspeccion) => i.id?.toString() === id || i.local_id === id,
      );

      if (!inspeccion) {
        await this.showToast('Inspección no encontrada', 'danger');
        this.router.navigate(['/inspecciones']);
        return;
      }

      this.inspeccionOriginal = inspeccion;

      // Filtrar áreas por empresa
      this.filterAreas(inspeccion.empresa_id);

      // Normalizar fechas al formato ISO 8601 sin microsegundos
      // ion-datetime solo acepta hasta 3 decimales (milisegundos)
      const normalizarFecha = (
        fecha: string | undefined,
      ): string | undefined => {
        if (!fecha) return undefined;
        try {
          // Eliminar microsegundos extras (más de 3 decimales) antes de parsear
          // Ej: 2026-01-14T00:00:00.000000Z -> 2026-01-14T00:00:00.000Z
          const fechaLimpia = fecha.replace(/(\.\d{3})\d*Z$/, '$1Z');
          // Convertir a Date y luego a ISO string estándar
          return new Date(fechaLimpia).toISOString();
        } catch {
          return undefined;
        }
      };

      // Llenar el formulario con un pequeño delay para que los ion-datetime se actualicen correctamente
      setTimeout(() => {
        this.inspeccionForm.patchValue({
          empresa_id: inspeccion.empresa_id,
          fundo_id: inspeccion.fundo_id,
          tipo_inspeccion: inspeccion.tipo_inspeccion,
          categoria: inspeccion.categoria || '',
          placa: inspeccion.placa || '',
          tipo_inspeccion_otro: inspeccion.tipo_inspeccion_otro,
          vigencia_desde: normalizarFecha(inspeccion.vigencia_desde),
          vigencia_hasta: normalizarFecha(inspeccion.vigencia_hasta),
          zona_inspeccionada: inspeccion.zona_inspeccionada,
          numero_registro: inspeccion.numero_registro,
          fecha_hora_inspeccion: normalizarFecha(
            inspeccion.fecha_hora_inspeccion,
          ),
          comentario: inspeccion.comentario,
          objetivo: inspeccion.objetivo,
          descripcion_causa: inspeccion.descripcion_causa,
          conclusiones_recomendaciones: inspeccion.conclusiones_recomendaciones,
        });

        // Forzar actualización de los controles
        this.inspeccionForm.updateValueAndValidity();
        this.inspeccionForm.markAsPristine();
        this.hasUnsavedChanges = false;
      }, 150);

      // Cargar áreas, inspectores y resultados desde IndexedDB
      if (inspeccion.id) {
        // Cargar áreas seleccionadas
        const inspeccionAreas =
          await this.databaseService.getInspeccionAreasByInspeccion(
            inspeccion.id,
          );
        this.areasSeleccionadas = [];
        for (const ia of inspeccionAreas) {
          const area = this.areas.find((a) => a.id === ia.area_id);
          if (area) {
            this.areasSeleccionadas.push(area);
          }
        }

        // Cargar inspectores seleccionados
        const inspeccionInspectores =
          await this.databaseService.getInspeccionInspectoresByInspeccion(
            inspeccion.id,
          );
        this.inspectoresSeleccionados = [];
        this.firmasInspectores = {};
        for (const ii of inspeccionInspectores) {
          const personal = this.personalList.find(
            (p) => p.id === ii.personal_id,
          );
          if (personal) {
            this.inspectoresSeleccionados.push(personal);
            if (ii.fecha_firma || ii.firma_digital) {
              this.firmasInspectores[personal.id!] = {
                fecha_firma: ii.fecha_firma,
                firma_digital: ii.firma_digital,
              };
            }
          }
        }

        // Cargar resultados
        const resultadosRaw =
          await this.databaseService.getResultadosByInspeccion(inspeccion.id);

        // Normalizar resultados: convertir snake_case a camelCase
        this.resultados = resultadosRaw.map((resultado: any) => {
          // Normalizar responsables_levantamiento → responsablesLevantamiento
          if (
            resultado.responsables_levantamiento &&
            !resultado.responsablesLevantamiento
          ) {
            resultado.responsablesLevantamiento =
              resultado.responsables_levantamiento;
          }

          // Normalizar visores
          if (!resultado.visores) {
            resultado.visores = [];
          }

          // Normalizar fotoFinalAprobador
          if (resultado.foto_final_aprobador && !resultado.fotoFinalAprobador) {
            resultado.fotoFinalAprobador = resultado.foto_final_aprobador;
          }

          // Normalizar fotoInicialAprobador
          if (
            resultado.foto_inicial_aprobador &&
            !resultado.fotoInicialAprobador
          ) {
            resultado.fotoInicialAprobador = resultado.foto_inicial_aprobador;
          }

          // Normalizar fecha_cierre (quitar microsegundos extra)
          if (resultado.fecha_cierre) {
            resultado.fecha_cierre = resultado.fecha_cierre.replace(
              /(\.[0-9]{3})[0-9]*Z$/,
              '$1Z',
            );
          }

          return resultado;
        });
      }
    } catch (error) {
      console.error('Error al cargar inspección:', error);
      await this.showToast('Error al cargar inspección', 'danger');
      this.router.navigate(['/inspecciones']);
    } finally {
      await loading.dismiss();
    }
  }

  async guardar(navigateAfterSave: boolean = true): Promise<boolean> {
    if (this.inspeccionForm.invalid) {
      await this.showToast(
        'Por favor completa todos los campos requeridos',
        'warning',
      );
      return false;
    }

    // Validar que todos los resultados tengan descripción
    const resultadosSinDescripcion = this.resultados.filter(
      (r, i) => !r.descripcion || r.descripcion.trim() === '',
    );
    if (resultadosSinDescripcion.length > 0) {
      const indices = this.resultados
        .map((r, i) =>
          !r.descripcion || r.descripcion.trim() === '' ? i + 1 : null,
        )
        .filter((i) => i !== null);
      await this.showToast(
        `La descripción es obligatoria en el resultado #${indices.join(', #')}`,
        'warning',
      );
      return false;
    }

    const loading = await this.loadingController.create({
      message: 'Guardando inspección...',
    });
    await loading.present();

    try {
      this.isSaving = true;
      const formData = this.inspeccionForm.value;
      const user = this.authService.currentUserValue;

      // Obtener datos de la empresa seleccionada para snapshot
      const empresa = this.empresas.find((e) => e.id === formData.empresa_id);

      const inspeccionData: Inspeccion = {
        local_id:
          this.isEditMode && this.inspeccionOriginal
            ? this.inspeccionOriginal.local_id
            : uuidv4(),
        user_id: user?.id || 0,
        empresa_id: formData.empresa_id,
        area_id:
          this.areasSeleccionadas.length > 0
            ? this.areasSeleccionadas[0].id
            : null, // Compatibilidad: usar primera área o null
        tipo_inspeccion: formData.tipo_inspeccion,
        categoria: formData.categoria || null,
        placa: formData.placa?.trim().toUpperCase() || null,
        tipo_inspeccion_otro: formData.tipo_inspeccion_otro,
        vigencia_desde: formData.vigencia_desde,
        vigencia_hasta: formData.vigencia_hasta,
        // Snapshot de empresa
        razon_social: empresa?.razon_social,
        ruc: empresa?.ruc,
        domicilio: empresa?.domicilio,
        actividad_economica: empresa?.actividad_economica,
        // Datos de inspección
        fundo_id: formData.fundo_id || null,
        zona_inspeccionada: formData.zona_inspeccionada,
        numero_registro: formData.numero_registro,
        fecha_hora_inspeccion: formData.fecha_hora_inspeccion,
        comentario: formData.comentario,
        objetivo: formData.objetivo,
        descripcion_causa: formData.descripcion_causa,
        conclusiones_recomendaciones: formData.conclusiones_recomendaciones,
        synced: false,
        created_at:
          this.isEditMode && this.inspeccionOriginal?.created_at
            ? this.inspeccionOriginal.created_at
            : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (this.isEditMode && this.inspeccionOriginal) {
        // Actualizar en IndexedDB
        const inspeccionActualizada = {
          ...this.inspeccionOriginal,
          ...inspeccionData,
        };
        await this.databaseService.updateInspeccion(inspeccionActualizada);

        // Guardar relaciones
        await this.guardarRelaciones(inspeccionActualizada.local_id);

        await this.showToast('Inspección actualizada', 'success');
      } else {
        // Guardar nuevo en IndexedDB
        await this.databaseService.saveInspeccion(inspeccionData);

        // Guardar relaciones
        await this.guardarRelaciones(inspeccionData.local_id);

        await this.showToast('Inspección guardada', 'success');
      }

      // Si está online, intentar sincronizar inmediatamente
      if (this.isOnline) {
        try {
          await this.syncService.syncInspecciones();
          console.log('✅ Inspección sincronizada automáticamente');
        } catch (error) {
          console.warn(
            '⚠️ No se pudo sincronizar automáticamente, se sincronizará más tarde',
            error,
          );
        }
      }

      this.hasUnsavedChanges = false;
      this.inspeccionForm.markAsPristine();

      if (navigateAfterSave) {
        this.router.navigate(['/inspecciones']);
      }

      return true;
    } catch (error: any) {
      console.error('Error al guardar:', error);
      await this.showToast('Error al guardar: ' + error.message, 'danger');
      return false;
    } finally {
      this.isSaving = false;
      await loading.dismiss();
    }
  }

  async guardarRelaciones(inspeccionLocalId: string) {
    // Obtener la inspección guardada para tener su ID de IndexedDB
    const inspeccion = await this.databaseService.inspecciones
      .where('local_id')
      .equals(inspeccionLocalId)
      .first();

    if (!inspeccion || !inspeccion.id) {
      console.error(
        'No se pudo encontrar la inspección para guardar relaciones',
      );
      return;
    }

    const inspeccionIndexedDBId = inspeccion.id;

    // Si estamos en modo edición, limpiar relaciones antiguas
    if (this.isEditMode) {
      await this.databaseService.inspeccion_areas
        .where('inspeccion_id')
        .equals(inspeccionIndexedDBId)
        .delete();

      await this.databaseService.inspeccion_inspectores
        .where('inspeccion_id')
        .equals(inspeccionIndexedDBId)
        .delete();

      await this.databaseService.resultados_inspeccion
        .where('inspeccion_id')
        .equals(inspeccionIndexedDBId)
        .delete();
    }

    // 1. Guardar áreas seleccionadas
    const inspeccionAreas: InspeccionArea[] = this.areasSeleccionadas.map(
      (area) => ({
        local_id: uuidv4(),
        inspeccion_id: inspeccionIndexedDBId,
        area_id: area.id,
        synced: false,
      }),
    );
    if (inspeccionAreas.length > 0) {
      await this.databaseService.saveInspeccionAreas(inspeccionAreas);
    }

    // 2. Guardar inspectores seleccionados
    const inspectores: InspeccionInspector[] = this.inspectoresSeleccionados
      .filter((personal) => personal.id !== undefined)
      .map((personal) => ({
        local_id: uuidv4(),
        inspeccion_id: inspeccionIndexedDBId,
        personal_id: personal.id!,
        fecha_firma: this.firmasInspectores[personal.id!]?.fecha_firma,
        firma_digital: this.firmasInspectores[personal.id!]?.firma_digital,
        synced: false,
      }));
    if (inspectores.length > 0) {
      await this.databaseService.saveInspeccionInspectores(inspectores);
    }

    // 3. Guardar resultados/hallazgos
    const resultadosConId = this.resultados.map((r) => {
      // Crear copia limpia del resultado
      const resultadoLimpio: any = {
        ...r,
        inspeccion_id: inspeccionIndexedDBId,
      };

      // Limpiar visores: copiar objetos completos válidos
      if (r.visores && Array.isArray(r.visores)) {
        resultadoLimpio.visores = r.visores
          .filter((v) => v && v.id !== undefined)
          .map((v) => ({ ...v }));
      }

      // Limpiar responsablesLevantamiento: copiar objetos completos válidos
      if (
        r.responsablesLevantamiento &&
        Array.isArray(r.responsablesLevantamiento)
      ) {
        resultadoLimpio.responsablesLevantamiento = r.responsablesLevantamiento
          .filter((rl) => rl && rl.id !== undefined)
          .map((rl) => ({ ...rl }));
      }

      return resultadoLimpio;
    });

    if (resultadosConId.length > 0) {
      await this.databaseService.saveResultadosInspeccion(resultadosConId);
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.hasPendingChanges()) {
      event.preventDefault();
      event.returnValue = true;
    }
  }

  hasPendingChanges(): boolean {
    return this.hasUnsavedChanges || this.inspeccionForm?.dirty;
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.hasPendingChanges()) {
      return true;
    }

    return await this.confirmLeaveWithUnsavedChanges();
  }

  private async confirmLeaveWithUnsavedChanges(): Promise<boolean> {
    return await new Promise<boolean>(async (resolve) => {
      const alert = await this.alertController.create({
        header: '¿Desea guardar el avance?',
        message:
          'Tiene cambios sin guardar. Si sale o actualiza la página, la información ingresada se perderá.',
        buttons: [
          {
            text: 'Cancelar',
            role: 'cancel',
            handler: () => resolve(false),
          },
          {
            text: 'Salir sin guardar',
            role: 'destructive',
            handler: () => {
              this.hasUnsavedChanges = false;
              this.inspeccionForm.markAsPristine();
              resolve(true);
            },
          },
          {
            text: 'Guardar avance',
            handler: async () => {
              const saved = await this.guardar(false);
              resolve(saved);
            },
          },
        ],
      });

      await alert.present();
    });
  }

  private markUnsavedChanges() {
    if (!this.isSaving) {
      this.hasUnsavedChanges = true;
    }
  }

  async cancelar() {
    if (await this.canDeactivate()) {
      this.router.navigate(['/inspecciones']);
    }
  }

  // ========== GESTIÓN DE ÁREAS MÚLTIPLES (MODAL) ==========
  async openAreaSelectionModal() {
    const modal = await this.modalController.create({
      component: AreaSelectionModalComponent,
      componentProps: {
        areas: this.areasFiltradas,
        areasSeleccionadas: [...this.areasSeleccionadas], // Clonar para no modificar directamente
      },
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data && data.areas) {
      this.areasSeleccionadas = data.areas;
      this.markUnsavedChanges();
    }
  }

  getAreasSeleccionadasText(): string {
    if (this.areasSeleccionadas.length === 0) {
      return 'Seleccionar Áreas';
    }
    if (this.areasSeleccionadas.length === 1) {
      return this.areasSeleccionadas[0].name;
    }
    return `${this.areasSeleccionadas.length} áreas seleccionadas`;
  }

  getAreasNombresLista(): string {
    return this.areasSeleccionadas.map((a) => a.name).join(', ');
  }

  // ========== GESTIÓN DE INSPECTORES (MODAL) ==========
  async openInspectorSelectionModal() {
    const modal = await this.modalController.create({
      component: InspectorSelectionModalComponent,
      componentProps: {
        personalList: this.personalList,
        inspectoresSeleccionados: [...this.inspectoresSeleccionados], // Clonar
      },
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data && data.inspectores) {
      this.inspectoresSeleccionados = data.inspectores;
      this.markUnsavedChanges();
    }
  }

  getInspectoresSeleccionadosText(): string {
    if (this.inspectoresSeleccionados.length === 0) {
      return 'Seleccionar Inspectores';
    }
    if (this.inspectoresSeleccionados.length === 1) {
      return this.getNombreCompleto(this.inspectoresSeleccionados[0]);
    }
    return `${this.inspectoresSeleccionados.length} inspectores seleccionados`;
  }

  getInspectoresNombresLista(): string {
    return this.inspectoresSeleccionados
      .map((p) => this.getNombreCompleto(p))
      .join(', ');
  }

  getNombreCompleto(personal: Personal): string {
    return `${personal.nombres || ''} ${personal.apellido_paterno || ''} ${
      personal.apellido_materno || ''
    }`.trim();
  }

  // ========== FIRMA DE INSPECTORES ==========
  onFirmaChange(personalId: number, firma: string | undefined) {
    if (!this.firmasInspectores[personalId]) {
      this.firmasInspectores[personalId] = {};
    }
    this.firmasInspectores[personalId].firma_digital = firma;
    if (firma) {
      this.firmasInspectores[personalId].fecha_firma = new Date()
        .toISOString()
        .split('T')[0];
    } else {
      this.firmasInspectores[personalId].fecha_firma = undefined;
    }
    this.markUnsavedChanges();
  }

  // ========== GESTIÓN DE RESULTADOS/HALLAZGOS ==========
  agregarResultado() {
    const primerResultado = this.resultados[0];
    const nuevoResultado: ResultadoInspeccion = {
      local_id: uuidv4(),
      inspeccion_id: 0, // Se asignará al guardar
      descripcion: '',
      nivel_riesgo: 'Medio',
      estado: 'Pendiente',
      synced: false,
      responsable_id: primerResultado?.responsable_id,
      responsable: primerResultado?.responsable
        ? structuredClone(primerResultado.responsable)
        : undefined,
      visores: structuredClone(primerResultado?.visores || []),
      responsablesLevantamiento: structuredClone(
        primerResultado?.responsablesLevantamiento || [],
      ),
    };

    // Calcular fecha límite automática según nivel de riesgo
    this.calcularFechaLimite(nuevoResultado);

    this.resultados.push(nuevoResultado);
    this.markUnsavedChanges();
  }

  limpiarAsignaciones(index: number) {
    const resultado = this.resultados[index];
    if (index < 1 || !resultado) return;

    resultado.responsable_id = undefined;
    resultado.responsable = undefined;
    resultado.visores = [];
    resultado.responsablesLevantamiento = [];
    this.resultados = [...this.resultados];
    this.markUnsavedChanges();
  }

  eliminarResultado(index: number) {
    this.resultados.splice(index, 1);
    this.markUnsavedChanges();
  }

  async tomarFoto(
    resultado: ResultadoInspeccion,
    tipo: 'inicial' | 'final',
    source: 'camera' | 'gallery' = 'camera',
  ) {
    try {
      // Solicitar permisos y capturar foto
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl, // Base64 para offline-first
        source:
          source === 'gallery' ? CameraSource.Photos : CameraSource.Camera,
        saveToGallery: false,
      });

      // La imagen viene como data URL (data:image/jpeg;base64,...)
      const imageData = image.dataUrl;

      if (!imageData) {
        await this.showToast('No se pudo capturar la imagen', 'danger');
        return;
      }

      // Asignar la imagen al resultado según el tipo
      if (tipo === 'inicial') {
        resultado.registro_fotografico_inicial = imageData;
        this.markUnsavedChanges();
        await this.showToast('Foto inicial capturada', 'success');
      } else {
        resultado.registro_fotografico_final = imageData;
        resultado.foto_final_estado = 'pendiente';
        this.markUnsavedChanges();

        // Si el resultado ya está guardado en el servidor (tiene ID), subir la foto inmediatamente
        if (resultado.id && this.isOnline) {
          await this.subirFotoFinalAlServidor(resultado, imageData);
        } else {
          await this.showToast('Foto final capturada', 'success');
        }
      }
    } catch (error: any) {
      console.error('Error al capturar foto:', error);

      // Manejar errores específicos
      if (error.message && error.message.includes('User cancelled')) {
        await this.showToast('Captura de foto cancelada', 'warning');
      } else if (error.message && error.message.includes('permission')) {
        await this.showToast('Permiso de cámara denegado', 'danger');
      } else {
        await this.showToast('Error al capturar foto', 'danger');
      }
    }
  }

  async subirFotoFinalAlServidor(
    resultado: ResultadoInspeccion,
    imageData: string,
  ) {
    const loading = await this.loadingController.create({
      message: 'Subiendo foto...',
    });
    await loading.present();

    try {
      const response = await this.apiService.post(
        `/resultados/${resultado.id}/foto-final`,
        { foto: imageData },
      );

      if (response && response.success) {
        // Actualizar el resultado con la ruta del servidor
        resultado.registro_fotografico_final =
          response.data?.registro_fotografico_final;
        resultado.foto_final_estado = 'pendiente';

        // Sincronizar la inspección a IndexedDB
        if (this.inspeccionOriginal?.id) {
          await this.syncService.syncInspeccionFromServer(
            this.inspeccionOriginal.id,
          );
        }

        await this.showToast(
          'Foto subida. Esperando validación del inspector.',
          'success',
        );
      } else {
        await this.showToast('Error al subir la foto', 'danger');
      }
    } catch (error: any) {
      console.error('Error al subir foto:', error);
      await this.showToast(error.message || 'Error al subir la foto', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  getRiesgoColor(nivel: NivelRiesgo): string {
    switch (nivel) {
      case 'Alto':
        return 'danger';
      case 'Medio':
        return 'warning';
      case 'Bajo':
        return 'success';
      default:
        return 'medium';
    }
  }

  /**
   * Obtener el plazo máximo según nivel de riesgo
   */
  getPlazoTexto(nivel: NivelRiesgo): string {
    switch (nivel) {
      case 'Alto':
        return '0-48 hrs';
      case 'Medio':
        return '0-7 días';
      case 'Bajo':
        return '0-15 días';
      default:
        return '';
    }
  }

  /**
   * Obtener días de plazo según nivel de riesgo
   */
  getDiasPlazo(nivel: NivelRiesgo): number {
    switch (nivel) {
      case 'Alto':
        return 2; // 48 horas = 2 días
      case 'Medio':
        return 7;
      case 'Bajo':
        return 15;
      default:
        return 7;
    }
  }

  /**
   * Calcular fecha límite automática según nivel de riesgo
   */
  calcularFechaLimite(resultado: ResultadoInspeccion): void {
    // Solo calcular automáticamente si está en Pendiente
    if (resultado.estado === 'Pendiente') {
      const fechaInspeccion = this.inspeccionForm.get(
        'fecha_hora_inspeccion',
      )?.value;
      const fechaBase = fechaInspeccion
        ? new Date(fechaInspeccion)
        : new Date();
      const diasPlazo = this.getDiasPlazo(resultado.nivel_riesgo);

      const fechaLimite = new Date(fechaBase);
      fechaLimite.setDate(fechaLimite.getDate() + diasPlazo);

      resultado.fecha_cierre = fechaLimite.toISOString();
    }
  }

  /**
   * Evento cuando cambia el nivel de riesgo
   */
  onNivelRiesgoChange(resultado: ResultadoInspeccion): void {
    this.calcularFechaLimite(resultado);
    this.markUnsavedChanges();
  }

  /**
   * Evento cuando cambia el estado
   */
  onEstadoChange(resultado: ResultadoInspeccion): void {
    // Buena Práctica, Cumplimiento y Ejecutado: fecha = fecha de inspección
    if (
      resultado.estado === 'Buena Práctica' ||
      resultado.estado === 'Cumplimiento' ||
      resultado.estado === 'Ejecutado'
    ) {
      const fechaInspeccion = this.inspeccionForm.get(
        'fecha_hora_inspeccion',
      )?.value;
      resultado.fecha_cierre = fechaInspeccion
        ? fechaInspeccion
        : new Date().toISOString();
    } else {
      // Pendiente: recalcular fecha límite según nivel de riesgo
      this.calcularFechaLimite(resultado);
    }
    this.markUnsavedChanges();
  }

  getEstadoColor(estado: EstadoResultado): string {
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

  getNombrePersonal(personal: Personal | undefined): string {
    if (!personal) return '';
    return `${personal.nombres} ${personal.apellido_paterno || ''} ${
      personal.apellido_materno || ''
    }`.trim();
  }

  async seleccionarResponsable(resultadoIndex: number) {
    if (!this.inspeccionForm.get('empresa_id')?.value) {
      await this.showToast('Primero selecciona una empresa', 'warning');
      return;
    }

    const modal = await this.modalController.create({
      component: InspectorSelectionModalComponent,
      componentProps: {
        personalList: this.personalList,
        inspectoresSeleccionados: this.resultados[resultadoIndex].responsable
          ? [this.resultados[resultadoIndex].responsable!]
          : [],
        filtrarSoloInspectores: false, // Mostrar todo el personal
        seleccionUnica: true, // Solo puede seleccionar un responsable
      },
    });

    await modal.present();
    const { data } = await modal.onWillDismiss();

    if (data && data.inspectores && data.inspectores.length > 0) {
      // Actualizar el responsable
      const nuevoResponsable = data.inspectores[0];
      this.resultados[resultadoIndex].responsable = nuevoResponsable;
      this.resultados[resultadoIndex].responsable_id = nuevoResponsable.id;
      // Forzar detección de cambios reasignando el array
      this.resultados = [...this.resultados];
      this.markUnsavedChanges();
    } else if (data && data.inspectores && data.inspectores.length === 0) {
      // Si deseleccionó todo, limpiar el responsable
      this.resultados[resultadoIndex].responsable = undefined;
      this.resultados[resultadoIndex].responsable_id = undefined;
      this.resultados = [...this.resultados];
      this.markUnsavedChanges();
    }
  }

  async seleccionarVisores(resultadoIndex: number) {
    if (!this.inspeccionForm.get('empresa_id')?.value) {
      await this.showToast('Primero selecciona una empresa', 'warning');
      return;
    }

    const modal = await this.modalController.create({
      component: InspectorSelectionModalComponent,
      componentProps: {
        personalList: this.personalList,
        inspectoresSeleccionados: this.resultados[resultadoIndex].visores || [],
        filtrarSoloInspectores: false, // Mostrar todo el personal
      },
    });

    await modal.present();
    const { data } = await modal.onWillDismiss();

    if (data && data.inspectores) {
      this.resultados[resultadoIndex].visores = data.inspectores;
      // Forzar detección de cambios
      this.resultados = [...this.resultados];
      this.markUnsavedChanges();
    }
  }

  // Obtener lista de nombres de visores para un resultado
  getVisoresNombresLista(resultado: ResultadoInspeccion): string {
    if (!resultado.visores || resultado.visores.length === 0) return '';
    return resultado.visores
      .map((v: any) => {
        // Puede ser Personal directamente o ResultadoVisor con personal anidado
        if (v.nombres) {
          return this.getNombrePersonal(v as Personal);
        } else if (v.personal) {
          return this.getNombrePersonal(v.personal);
        }
        return '';
      })
      .filter((n: string) => n)
      .join(', ');
  }

  // Obtener lista de nombres de responsables de levantamiento para un resultado
  getResponsablesLevantamientoNombresLista(
    resultado: ResultadoInspeccion,
  ): string {
    if (
      !resultado.responsablesLevantamiento ||
      resultado.responsablesLevantamiento.length === 0
    )
      return '';
    return resultado.responsablesLevantamiento
      .map((r: any) => {
        // Puede ser Personal directamente o ResultadoResponsableLevantamiento con personal anidado
        if (r.nombres) {
          return this.getNombrePersonal(r as Personal);
        } else if (r.personal) {
          return this.getNombrePersonal(r.personal);
        }
        return '';
      })
      .filter((n: string) => n)
      .join(', ');
  }

  async seleccionarResponsablesLevantamiento(resultadoIndex: number) {
    if (!this.inspeccionForm.get('empresa_id')?.value) {
      await this.showToast('Primero selecciona una empresa', 'warning');
      return;
    }

    const modal = await this.modalController.create({
      component: InspectorSelectionModalComponent,
      componentProps: {
        personalList: this.personalList,
        inspectoresSeleccionados:
          this.resultados[resultadoIndex].responsablesLevantamiento || [],
        filtrarSoloInspectores: false, // Mostrar todo el personal
      },
    });

    await modal.present();
    const { data } = await modal.onWillDismiss();

    if (data && data.inspectores) {
      this.resultados[resultadoIndex].responsablesLevantamiento =
        data.inspectores;
      // Forzar detección de cambios
      this.resultados = [...this.resultados];
      this.markUnsavedChanges();
    }
  }

  get esInspector(): boolean {
    // Verificar si el usuario actual está en la lista de inspectores seleccionados
    const currentUser = this.authService.currentUserValue;
    if (!currentUser) return false;

    return this.inspectoresSeleccionados.some(
      (inspector) => inspector.id === currentUser.personal_id,
    );
  }

  puedeSubirFotoFinal(resultado: ResultadoInspeccion): boolean {
    // Puede subir foto final si es responsable de levantamiento o inspector
    const currentUser = this.authService.currentUserValue;
    if (!currentUser) return false;

    const esResponsableLevantamiento =
      resultado.responsablesLevantamiento?.some(
        (resp) => resp.id === currentUser.personal_id,
      );

    return this.esInspector || esResponsableLevantamiento || false;
  }

  async aprobarFoto(
    resultado: ResultadoInspeccion,
    tipo: 'inicial' | 'final',
    accion: 'aprobar' | 'rechazar',
  ) {
    if (!this.isOnline) {
      await this.showToast(
        'Debes estar conectado para aprobar fotos',
        'warning',
      );
      return;
    }

    if (!resultado.id) {
      await this.showToast('La inspección debe estar guardada', 'warning');
      return;
    }

    // Pedir comentario opcional
    const alert = await this.loadingController.create({
      message:
        accion === 'aprobar' ? 'Aprobando foto...' : 'Rechazando foto...',
    });
    await alert.present();

    try {
      let response: any;

      if (tipo === 'inicial') {
        response = await this.apiService.post(
          `/resultados/${resultado.id}/foto-inicial/aprobar`,
          { accion, comentario: '' },
        );
      } else {
        response = await this.apiService.post(
          `/resultados/${resultado.id}/foto-final/aprobar`,
          { accion, comentario: '' },
        );
      }

      await alert.dismiss();

      if (response.success) {
        // Actualizar el estado local en memoria
        const currentUser = this.authService.currentUserValue;

        if (tipo === 'inicial') {
          resultado.foto_inicial_estado =
            accion === 'aprobar' ? 'aprobada' : 'rechazada';
          if (accion === 'aprobar' && currentUser) {
            resultado.foto_inicial_aprobada_at = new Date().toISOString();
            resultado.foto_inicial_aprobador_id = currentUser.personal_id;
          }
        } else {
          resultado.foto_final_estado =
            accion === 'aprobar' ? 'aprobada' : 'rechazada';
          if (accion === 'aprobar' && currentUser) {
            resultado.foto_final_aprobada_at = new Date().toISOString();
            resultado.foto_final_aprobador_id = currentUser.personal_id;
          }
        }

        // Sincronizar la inspección completa desde el servidor a IndexedDB
        // Esto asegura que tengamos los datos del aprobador y demás info actualizada
        try {
          if (this.inspeccionOriginal?.id) {
            await this.syncService.syncInspeccionFromServer(
              this.inspeccionOriginal.id,
            );
            console.log(
              'Inspección sincronizada desde servidor:',
              this.inspeccionOriginal.id,
            );
          }
        } catch (syncError) {
          console.error('Error al sincronizar desde servidor:', syncError);
          // Si falla la sincronización completa, al menos guardamos el resultado local
          try {
            await this.databaseService.updateResultado(resultado);
            console.log(
              'Resultado actualizado localmente en IndexedDB:',
              resultado.id,
            );
          } catch (dbError) {
            console.error('Error al actualizar IndexedDB:', dbError);
          }
        }

        await this.showToast(response.message, 'success');
      } else {
        await this.showToast('Error al procesar la foto', 'danger');
      }
    } catch (error) {
      console.error('Error al aprobar foto:', error);
      await alert.dismiss();
      await this.showToast('Error al procesar la foto', 'danger');
    }
  }

  verFoto(fotoUrl: string) {
    // Abrir modal o ventana para ver la foto en grande
    // Por ahora solo mostramos un toast
    this.showToast('Visualizando foto', 'primary');
  }

  getEstadoFotoColor(estado: string): string {
    switch (estado) {
      case 'aprobada':
        return 'success';
      case 'rechazada':
        return 'danger';
      case 'pendiente':
      default:
        return 'warning';
    }
  }

  getEstadoFotoIcon(estado: string): string {
    switch (estado) {
      case 'aprobada':
        return 'checkmark-circle';
      case 'rechazada':
        return 'close-circle';
      case 'pendiente':
      default:
        return 'time';
    }
  }

  getEstadoFotoText(estado: string): string {
    switch (estado) {
      case 'aprobada':
        return 'Aprobada';
      case 'rechazada':
        return 'Rechazada';
      case 'pendiente':
      default:
        return 'Pendiente';
    }
  }

  private async showToast(message: string, color: string = 'dark') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  /**
   * Construir URL completa para imágenes almacenadas en el backend
   */
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
}
