import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
  HttpErrorResponse,
  HttpParams,
} from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retry, timeout } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  ApiResponse,
  PaginatedResponse,
  SyncResponse,
  Registro,
  RegistroForm,
  Catalogos,
  Campania,
  Fundo,
  EstadisticasRegistro,
} from '../models';
import { Empresa, Area } from '../models/catalogo.model';
import { Inspeccion, InspeccionSync } from '../models/inspeccion.model';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = environment.apiUrl;
  private readonly timeout = environment.api.timeout;
  private readonly retryAttempts = environment.api.retryAttempts;

  constructor(private http: HttpClient) {}

  /**
   * Obtener headers con token de autenticación
   */
  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    });
  }

  /**
   * Manejar errores HTTP
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Error desconocido';

    if (error.error instanceof ErrorEvent) {
      // Error del cliente
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Error del servidor
      errorMessage =
        error.error?.message || `Error ${error.status}: ${error.statusText}`;
      if (error.status === 422 && error.error?.errors && typeof error.error.errors === 'object') {
        const mensajes = Object.values(error.error.errors).reduce<string[]>((lista, valor) => {
          const textos = Array.isArray(valor)
            ? valor.filter((texto): texto is string => typeof texto === 'string')
            : typeof valor === 'string' ? [valor] : [];
          return lista.concat(textos);
        }, []);
        if (mensajes.length) errorMessage = [...new Set(mensajes)].join('\n');
      }
    }

    console.error('API Error:', errorMessage, error);
    const apiError = Object.assign(new Error(errorMessage), {
      status: error.status,
      validationErrors: error.error?.errors,
    });
    return throwError(() => apiError);
  }

  /**
   * Normalizar endpoint para asegurar que empiece con /
   */
  private normalizeEndpoint(endpoint: string): string {
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }

  // ==================== MÉTODOS GENÉRICOS ====================

  /**
   * GET genérico
   */
  get<T = any>(endpoint: string, params?: HttpParams): Promise<T> {
    const url = `${this.baseUrl}${this.normalizeEndpoint(endpoint)}`;
    return this.http
      .get<T>(url, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      )
      .toPromise() as Promise<T>;
  }

  /**
   * POST genérico
   */
  post<T = any>(endpoint: string, data: any): Promise<T> {
    const url = `${this.baseUrl}${this.normalizeEndpoint(endpoint)}`;
    return this.http
      .post<T>(url, data, {
        headers: this.getHeaders(),
      })
      .pipe(timeout(this.timeout), catchError(this.handleError))
      .toPromise() as Promise<T>;
  }

  /**
   * PUT genérico
   */
  put<T = any>(endpoint: string, data: any): Promise<T> {
    const url = `${this.baseUrl}${this.normalizeEndpoint(endpoint)}`;
    return this.http
      .put<T>(url, data, {
        headers: this.getHeaders(),
      })
      .pipe(timeout(this.timeout), catchError(this.handleError))
      .toPromise() as Promise<T>;
  }

  /**
   * DELETE genérico
   */
  delete<T = any>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${this.normalizeEndpoint(endpoint)}`;
    return this.http
      .delete<T>(url, { headers: this.getHeaders() })
      .pipe(timeout(this.timeout), catchError(this.handleError))
      .toPromise() as Promise<T>;
  }

  // ==================== AUTENTICACIÓN ====================

  /**
   * Login con Microsoft OAuth
   */
  loginWithMicrosoft(): void {
    window.location.href = `${this.baseUrl}/auth/microsoft`;
  }

  /**
   * Logout
   */
  logout(): Observable<ApiResponse<null>> {
    return this.http
      .post<
        ApiResponse<null>
      >(`${this.baseUrl}/auth/logout`, {}, { headers: this.getHeaders() })
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  /**
   * Obtener información del usuario autenticado
   */
  getCurrentUser(): Observable<ApiResponse<any>> {
    return this.http
      .get<ApiResponse<any>>(`${this.baseUrl}/auth/user`, {
        headers: this.getHeaders(),
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  // ==================== CATÁLOGOS ====================

  /**
   * Obtener todos los catálogos
   */
  getCatalogos(): Observable<ApiResponse<Catalogos>> {
    return this.http
      .get<ApiResponse<Catalogos>>(`${this.baseUrl}/sync/catalogos`, {
        headers: this.getHeaders(),
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  /**
   * Obtener campañas activas
   */
  getCampanias(): Observable<ApiResponse<Campania[]>> {
    return this.http
      .get<ApiResponse<Campania[]>>(`${this.baseUrl}/campanias`, {
        headers: this.getHeaders(),
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  /**
   * Obtener fundos activos
   */
  getFundos(): Observable<ApiResponse<Fundo[]>> {
    return this.http
      .get<ApiResponse<Fundo[]>>(`${this.baseUrl}/fundos`, {
        headers: this.getHeaders(),
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  /**
   * Obtener empresas activas
   */
  getEmpresas(): Observable<ApiResponse<Empresa[]>> {
    return this.http
      .get<ApiResponse<Empresa[]>>(`${this.baseUrl}/empresas`, {
        headers: this.getHeaders(),
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  /**
   * Obtener áreas activas
   */
  getAreas(empresaId?: number): Observable<ApiResponse<Area[]>> {
    let params = new HttpParams();
    if (empresaId) {
      params = params.set('empresa_id', empresaId.toString());
    }

    return this.http
      .get<ApiResponse<Area[]>>(`${this.baseUrl}/areas`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  // ==================== REGISTROS ====================

  /**
   * Obtener registros con paginación
   */
  getRegistros(
    page: number = 1,
    perPage: number = 50,
  ): Observable<PaginatedResponse<Registro>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    return this.http
      .get<PaginatedResponse<Registro>>(`${this.baseUrl}/registros`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  /**
   * Crear nuevo registro
   */
  createRegistro(registro: RegistroForm): Observable<ApiResponse<Registro>> {
    return this.http
      .post<ApiResponse<Registro>>(`${this.baseUrl}/registros`, registro, {
        headers: this.getHeaders(),
      })
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  /**
   * Obtener estadísticas de registros
   */
  getEstadisticas(): Observable<ApiResponse<EstadisticasRegistro>> {
    return this.http
      .get<
        ApiResponse<EstadisticasRegistro>
      >(`${this.baseUrl}/registros/estadisticas`, { headers: this.getHeaders() })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  // ==================== INSPECCIONES ====================

  /**
   * Obtener inspecciones con paginación
   */
  getInspecciones(
    page: number = 1,
    perPage: number = 50,
  ): Observable<PaginatedResponse<Inspeccion>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    return this.http
      .get<PaginatedResponse<Inspeccion>>(`${this.baseUrl}/inspecciones`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(
        timeout(this.timeout),
        retry(this.retryAttempts),
        catchError(this.handleError),
      );
  }

  /**
   * Crear nueva inspección
   */
  createInspeccion(
    inspeccion: Inspeccion,
  ): Observable<ApiResponse<Inspeccion>> {
    return this.http
      .post<ApiResponse<Inspeccion>>(
        `${this.baseUrl}/inspecciones`,
        inspeccion,
        {
          headers: this.getHeaders(),
        },
      )
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  /**
   * Actualizar inspección
   */
  updateInspeccion(
    id: number,
    inspeccion: Partial<Inspeccion>,
  ): Observable<ApiResponse<Inspeccion>> {
    return this.http
      .put<ApiResponse<Inspeccion>>(
        `${this.baseUrl}/inspecciones/${id}`,
        inspeccion,
        {
          headers: this.getHeaders(),
        },
      )
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  /**
   * Eliminar inspección
   */
  deleteInspeccion(id: number): Observable<ApiResponse<void>> {
    return this.http
      .delete<ApiResponse<void>>(`${this.baseUrl}/inspecciones/${id}`, {
        headers: this.getHeaders(),
      })
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  // ==================== SINCRONIZACIÓN ====================

  /**
   * Sincronizar registros offline
   */
  syncRegistros(registros: Registro[]): Observable<SyncResponse> {
    return this.http
      .post<SyncResponse>(
        `${this.baseUrl}/sync/registros`,
        { registros },
        { headers: this.getHeaders() },
      )
      .pipe(
        timeout(this.timeout * 2), // Timeout mayor para sincronización
        catchError(this.handleError),
      );
  }

  /**
   * Sincronizar inspecciones offline
   */
  syncInspecciones(inspecciones: InspeccionSync[]): Observable<SyncResponse> {
    return this.http
      .post<SyncResponse>(
        `${this.baseUrl}/sync/inspecciones`,
        { inspecciones },
        { headers: this.getHeaders() },
      )
      .pipe(
        timeout(this.timeout * 2), // Timeout mayor para sincronización
        catchError(this.handleError),
      );
  }

  /**
   * Obtener una inspección específica del servidor por su local_id
   */
  getInspeccionByLocalId(localId: string): Observable<ApiResponse<Inspeccion>> {
    return this.http
      .get<ApiResponse<Inspeccion>>(
        `${this.baseUrl}/sync/inspecciones/show/${localId}`,
        {
          headers: this.getHeaders(),
        },
      )
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  /**
   * Obtener inspecciones del servidor
   */
  downloadInspecciones(
    page: number = 1,
    perPage: number = 250,
  ): Observable<ApiResponse<Inspeccion[]>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('per_page', perPage.toString());

    return this.http
      .get<ApiResponse<Inspeccion[]>>(`${this.baseUrl}/sync/inspecciones`, {
        headers: this.getHeaders(),
        params,
      })
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  /**
   * Verificar conexión con el servidor
   */
  ping(): Observable<ApiResponse<{ timestamp: string }>> {
    return this.http
      .get<ApiResponse<{ timestamp: string }>>(`${this.baseUrl}/ping`, {
        headers: this.getHeaders(),
      })
      .pipe(
        timeout(5000), // 5 segundos
        catchError(this.handleError),
      );
  }

  // ==================== PERSONAL ====================

  /**
   * Sincronizar personal desde API externa (ejecución directa ~20s)
   */
  async syncPersonalFromExternalApi(): Promise<any> {
    const url = `${this.baseUrl}/personal/sync-from-api`;
    return this.http
      .post<any>(
        url,
        {},
        {
          headers: this.getHeaders(),
        },
      )
      .pipe(
        timeout(120000), // 2 minutos - la sync tarda ~20s pero damos margen
        catchError(this.handleError),
      )
      .toPromise() as Promise<any>;
  }

  /**
   * Consultar estado de sincronización de personal
   */
  async getSyncStatus(): Promise<any> {
    const url = `${this.baseUrl}/personal/sync-status`;
    return this.http
      .get<any>(url, {
        headers: this.getHeaders(),
      })
      .pipe(timeout(10000), catchError(this.handleError))
      .toPromise() as Promise<any>;
  }

  /**
   * Obtener todo el personal descargando por lotes paginados.
   * Devuelve { success: true, data: Personal[] }.
   * onProgress se invoca con (registrosCargados, total) en cada página.
   */
  async getPersonal(
    filters?: {
      empresa_id?: number;
      area_id?: number;
      cargo_id?: number;
      activo?: boolean;
      cesado?: boolean;
      search?: string;
    },
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<any> {
    const batchSize = 1000;
    let page = 1;
    let allData: any[] = [];
    let lastPage = 1;
    let total = 0;

    do {
      let params = new HttpParams()
        .set('per_page', String(batchSize))
        .set('page', String(page));

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params = params.set(key, String(value));
          }
        });
      }

      const response: any = await this.get('/personal', params);

      if (response?.data) {
        allData = allData.concat(response.data);
      }

      if (response?.pagination) {
        lastPage = response.pagination.last_page;
        total = response.pagination.total;
      } else {
        // Si no hay paginación, es que vino todo de golpe
        break;
      }

      if (onProgress) {
        onProgress(allData.length, total);
      }

      page++;
    } while (page <= lastPage);

    return { success: true, data: allData };
  }

  /**
   * Obtener un personal por ID
   */
  async getPersonalById(id: number): Promise<any> {
    return this.get(`/personal/${id}`);
  }

  /**
   * Crear nuevo personal
   */
  async createPersonal(data: any): Promise<any> {
    return this.post('/personal', data);
  }

  /**
   * Actualizar personal existente
   */
  async updatePersonal(id: number, data: any): Promise<any> {
    return this.put(`/personal/${id}`, data);
  }

  /**
   * Marcar personal como cesado
   */
  async marcarCesado(id: number, fechaCese?: string): Promise<any> {
    return this.post(`/personal/${id}/marcar-cesado`, {
      fecha_cese: fechaCese || new Date().toISOString().split('T')[0],
    });
  }

  /**
   * Reactivar personal cesado
   */
  async reactivarPersonal(id: number): Promise<any> {
    return this.post(`/personal/${id}/reactivar`, {});
  }

  /**
   * Upload de foto para inspecciones
   */
  uploadFoto(
    file: File,
    tipo: 'inicial' | 'final',
    resultadoId?: string,
  ): Observable<any> {
    const formData = new FormData();
    formData.append('foto', file);
    formData.append('tipo', tipo);
    if (resultadoId) {
      formData.append('resultado_id', resultadoId);
    }

    return this.http
      .post(`${this.baseUrl}/upload/foto`, formData, {
        headers: this.getAuthHeaders(), // Sin Content-Type para FormData
      })
      .pipe(
        timeout(30000), // 30 segundos para upload
        catchError(this.handleError),
      );
  }

  /**
   * Eliminar foto
   */
  deleteFoto(path: string): Observable<any> {
    return this.http
      .request('delete', `${this.baseUrl}/upload/foto`, {
        headers: this.getHeaders(),
        body: { path },
      })
      .pipe(timeout(this.timeout), catchError(this.handleError));
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }
}
