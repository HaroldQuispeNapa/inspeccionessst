import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DatabaseService } from './database.service';
import { Inspeccion, ResultadoInspeccion } from '../models/inspeccion.model';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class InspeccionService {
  private apiUrl = `${environment.apiUrl}/inspecciones`;

  constructor(
    private http: HttpClient,
    private databaseService: DatabaseService
  ) {}

  /**
   * Obtener todas las inspecciones (offline-first)
   */
  async getInspecciones(): Promise<Inspeccion[]> {
    return await this.databaseService.getInspecciones();
  }

  /** Actualizar solo la foto guardada en ambas copias locales, sin descargar toda la inspección. */
  async actualizarFotoFinalLocal(
    inspeccionLocalId: string,
    resultadoLocalId: string,
    cambios: Partial<ResultadoInspeccion>
  ): Promise<void> {
    await this.databaseService.transaction('rw',
      this.databaseService.inspecciones,
      this.databaseService.resultados_inspeccion,
      async () => {
        await this.databaseService.inspecciones.where('local_id').equals(inspeccionLocalId).modify((inspeccion) => {
          const resultado = inspeccion.resultados?.find((item) => item.local_id === resultadoLocalId);
          if (resultado) Object.assign(resultado, cambios);
        });
        await this.databaseService.resultados_inspeccion.where('local_id').equals(resultadoLocalId).modify(cambios);
      }
    );
  }

  /**
   * Obtener inspección por ID (offline-first, cae a local si falla)
   */
  async getInspeccionById(id: number): Promise<Inspeccion | undefined> {
    return await this.databaseService.inspecciones.get(id);
  }

  /**
   * Obtener inspección por ID directamente del servidor (para datos frescos)
   */
  async getInspeccionByIdFromServer(
    id: number
  ): Promise<Inspeccion | undefined> {
    try {
      const response: any = await firstValueFrom(
        this.http.get(`${this.apiUrl}/${id}`)
      );
      if (response.success && response.data) {
        return response.data as Inspeccion;
      }
      return undefined;
    } catch (error) {
      console.error('Error al obtener inspección del servidor:', error);
      // Fallback a datos locales
      return await this.databaseService.inspecciones.get(id);
    }
  }

  /**
   * Enviar notificaciones de una inspección
   */
  async enviarNotificaciones(inspeccionId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post(`${this.apiUrl}/${inspeccionId}/notificar`, {})
      );
      return response;
    } catch (error) {
      console.error('Error al enviar notificaciones:', error);
      throw error;
    }
  }

  /**
   * Enviar notificaciones masivas
   */
  async enviarNotificacionesMasivas(inspeccionIds: string[]): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post(`${environment.apiUrl}/notificaciones/masivas`, {
          inspeccion_ids: inspeccionIds,
        })
      );
      return response;
    } catch (error) {
      console.error('Error al enviar notificaciones masivas:', error);
      throw error;
    }
  }

  /**
   * Aprobar o rechazar foto inicial
   */
  async aprobarFotoInicial(
    resultadoId: number,
    accion: 'aprobar' | 'rechazar',
    comentario?: string
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post(
          `${environment.apiUrl}/resultados/${resultadoId}/foto-inicial/aprobar`,
          { accion, comentario }
        )
      );
      return response;
    } catch (error) {
      console.error('Error al aprobar foto inicial:', error);
      throw error;
    }
  }

  /**
   * Aprobar o rechazar foto final
   */
  async aprobarFotoFinal(
    resultadoId: number,
    accion: 'aprobar' | 'rechazar',
    comentario?: string
  ): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.post(
          `${environment.apiUrl}/resultados/${resultadoId}/foto-final/aprobar`,
          { accion, comentario }
        )
      );
      return response;
    } catch (error) {
      console.error('Error al aprobar foto final:', error);
      throw error;
    }
  }

  /**
   * Obtener historial de aprobaciones
   */
  async obtenerHistorialAprobaciones(resultadoId: number): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.http.get(
          `${environment.apiUrl}/resultados/${resultadoId}/aprobaciones`
        )
      );
      return response;
    } catch (error) {
      console.error('Error al obtener historial:', error);
      throw error;
    }
  }
}
