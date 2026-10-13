import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

describe('ApiService: errores de validación', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ApiService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
    spyOn(console, 'error');
  });

  afterEach(() => http.verify());

  it('muestra el motivo del error 422 al sincronizar y conserva los campos rechazados', async () => {
    const pending = firstValueFrom(service.syncInspecciones([])).catch((error) => error);
    const errores = { 'inspecciones.0.categoria': ['La categoría seleccionada no está permitida.'] };
    http.expectOne((request) => request.url.endsWith('/sync/inspecciones')).flush(
      { success: false, errors: errores }, { status: 422, statusText: 'Unprocessable Content' }
    );
    const error = await pending;
    expect(error.message).toBe('La categoría seleccionada no está permitida.');
    expect(error.status).toBe(422);
    expect(error.validationErrors).toEqual(errores);
  });

  it('incluye los mensajes de todos los campos rechazados', async () => {
    const pending = service.post('/sync/inspecciones', {}).catch((error) => error);
    http.expectOne((request) => request.url.endsWith('/sync/inspecciones')).flush(
      { errors: { categoria: ['Categoría inválida.'], numero_registro: ['Falta el número de registro.'] } },
      { status: 422, statusText: 'Unprocessable Content' }
    );
    const error = await pending;
    expect(error.message).toContain('Categoría inválida.');
    expect(error.message).toContain('Falta el número de registro.');
  });

  it('mantiene el mensaje del servidor cuando no hay detalles de validación', async () => {
    const pending = service.post('/sync/inspecciones', {}).catch((error) => error);
    http.expectOne((request) => request.url.endsWith('/sync/inspecciones')).flush(
      { message: 'Sesión expirada.' }, { status: 401, statusText: 'Unauthorized' }
    );
    const error = await pending;
    expect(error.message).toBe('Sesión expirada.');
    expect(error.status).toBe(401);
  });
});
