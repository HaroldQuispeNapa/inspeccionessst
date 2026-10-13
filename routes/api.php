<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CampaniaController;
use App\Http\Controllers\Api\FundoController;
use App\Http\Controllers\Api\RegistroController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\FileUploadController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\EmpresaController;
use App\Http\Controllers\Api\AreaController;
use App\Http\Controllers\Api\InspeccionController;
use App\Http\Controllers\Api\PersonalController;
use App\Http\Controllers\Api\CargoController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

// Rutas públicas (sin autenticación)
Route::prefix('v1')->group(function () {
    // Autenticación tradicional
    Route::post('/auth/login', [AuthController::class, 'login']);
    
    // Autenticación Microsoft OAuth
    Route::get('/auth/microsoft', [AuthController::class, 'redirectToMicrosoft']);
    Route::get('/auth/microsoft/callback', [AuthController::class, 'handleMicrosoftCallback']);
    Route::get('/auth/session', [AuthController::class, 'getSessionData']);
});

// Rutas protegidas con Sanctum
Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    
    // Autenticación
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/auth/logout-all', [AuthController::class, 'logoutAll']);
    Route::post('/auth/check-permission', [AuthController::class, 'checkPermission']);
    
    // Usuario autenticado
    Route::get('/user', function (Request $request) {
        return response()->json([
            'success' => true,
            'data' => $request->user()->load('roles.permissions'),
        ]);
    });

    // Sincronización
    Route::prefix('sync')->group(function () {
        Route::post('/registros', [SyncController::class, 'syncRegistros']);
        Route::get('/catalogos', [SyncController::class, 'downloadCatalogos']);
        Route::get('/registros', [SyncController::class, 'downloadRegistros']);
        Route::get('/status', [SyncController::class, 'checkStatus']);
        
        // Sincronización de inspecciones
        Route::post('/inspecciones', [SyncController::class, 'syncInspecciones']);
        Route::get('/inspecciones', [SyncController::class, 'downloadInspecciones']);
        // Obtener inspección específica por local_id (para refrescar al editar)
        Route::get('/inspecciones/show/{local_id}', [SyncController::class, 'getInspeccionByLocalId']);
        // Tombstones: inspecciones eliminadas para propagar deletes entre dispositivos
        Route::get('/inspecciones/deleted', [SyncController::class, 'getDeletedInspecciones']);
        // Eliminar inspección por local_id (soporta sincronización de borrados desde cliente)
        Route::post('/inspecciones/delete', [SyncController::class, 'deleteInspeccionByLocalId']);
    });

    // Upload de archivos
    Route::prefix('upload')->group(function () {
        Route::post('/foto', [FileUploadController::class, 'uploadFoto']);
        Route::delete('/foto', [FileUploadController::class, 'deleteFoto']);
    });

    // Catálogos - Campañas
    Route::get('campanias', [CampaniaController::class, 'index']);
    Route::get('campanias/{id}', [CampaniaController::class, 'show']);
    Route::middleware('permission:campanias.manage')->group(function () {
        Route::post('campanias', [CampaniaController::class, 'store']);
        Route::put('campanias/{id}', [CampaniaController::class, 'update']);
        Route::delete('campanias/{id}', [CampaniaController::class, 'destroy']);
    });

    // Catálogos - Fundos
    Route::get('fundos', [FundoController::class, 'index']);
    Route::get('fundos/{id}', [FundoController::class, 'show']);
    Route::middleware('permission:fundos.manage')->group(function () {
        Route::post('fundos', [FundoController::class, 'store']);
        Route::put('fundos/{id}', [FundoController::class, 'update']);
        Route::delete('fundos/{id}', [FundoController::class, 'destroy']);
    });

    // Catálogos - Empresas
    Route::get('empresas', [EmpresaController::class, 'index']);
    Route::get('empresas/{id}', [EmpresaController::class, 'show']);
    Route::middleware('permission:empresas.manage')->group(function () {
        Route::post('empresas', [EmpresaController::class, 'store']);
        Route::put('empresas/{id}', [EmpresaController::class, 'update']);
        Route::delete('empresas/{id}', [EmpresaController::class, 'destroy']);
    });

    // Catálogos - Áreas
    Route::get('areas', [AreaController::class, 'index']);
    Route::get('areas/{id}', [AreaController::class, 'show']);
    Route::middleware('permission:areas.manage')->group(function () {
        Route::post('areas', [AreaController::class, 'store']);
        Route::put('areas/{id}', [AreaController::class, 'update']);
        Route::delete('areas/{id}', [AreaController::class, 'destroy']);
    });

    // Catálogos - Cargos
    Route::get('cargos', [CargoController::class, 'index']);
    Route::get('cargos/{id}', [CargoController::class, 'show']);
    Route::middleware('permission:cargos.manage')->group(function () {
        Route::post('cargos', [CargoController::class, 'store']);
        Route::put('cargos/{id}', [CargoController::class, 'update']);
        Route::delete('cargos/{id}', [CargoController::class, 'destroy']);
    });

    // Inspecciones
    Route::prefix('inspecciones')->group(function () {
        Route::get('/', [InspeccionController::class, 'index']);
        Route::post('/', [InspeccionController::class, 'store']);
        Route::get('/{id}', [InspeccionController::class, 'show']);
        Route::put('/{id}', [InspeccionController::class, 'update']);
        Route::delete('/{id}', [InspeccionController::class, 'destroy']);
        Route::get('/{local_id}/template', [InspeccionController::class, 'downloadTemplate']);
        
        // Notificaciones
        Route::post('/{id}/notificar', [\App\Http\Controllers\Api\NotificationController::class, 'enviarNotificacionesInspeccion']);
    });

    // Notificaciones masivas
    Route::post('/notificaciones/masivas', [\App\Http\Controllers\Api\NotificationController::class, 'enviarNotificacionesMasivas']);

    // Aprobación de fotos
    Route::prefix('resultados')->group(function () {
        Route::post('/{id}/comentarios', [\App\Http\Controllers\Api\ResultadoComentarioController::class, 'store']);
        Route::post('/{id}/foto-inicial/aprobar', [\App\Http\Controllers\Api\FotoApprovalController::class, 'aprobarFotoInicial']);
        Route::post('/{id}/foto-final', [\App\Http\Controllers\Api\FotoApprovalController::class, 'subirFotoFinal']);
        Route::post('/{id}/foto-final/validar', [\App\Http\Controllers\Api\FotoApprovalController::class, 'aprobarFotoFinal']);
        Route::post('/{id}/foto-final/aprobar', [\App\Http\Controllers\Api\FotoApprovalController::class, 'aprobarFotoFinal']);
        Route::get('/{id}/aprobaciones', [\App\Http\Controllers\Api\FotoApprovalController::class, 'obtenerHistorial']);
    });

    // Push Notifications
    Route::prefix('push-notifications')->group(function () {
        Route::post('/register', [\App\Http\Controllers\Api\PushNotificationController::class, 'registerToken']);
        Route::post('/deactivate', [\App\Http\Controllers\Api\PushNotificationController::class, 'deactivateToken']);
        Route::get('/tokens', [\App\Http\Controllers\Api\PushNotificationController::class, 'getUserTokens']);
        Route::post('/test', [\App\Http\Controllers\Api\PushNotificationController::class, 'sendTestNotification']);
    });

    // Personal
    Route::prefix('personal')->group(function () {
        Route::get('/', [PersonalController::class, 'index']);

        // Sincronización (rutas estáticas ANTES de {id})
        Route::post('/sync-from-api', [PersonalController::class, 'syncFromExternalApi']);
        Route::get('/sync-status', [PersonalController::class, 'syncStatus']);

        Route::get('/{id}', [PersonalController::class, 'show']);
        
        // Validación para notificaciones (necesario para seleccionar personal en inspecciones)
        Route::get('/{id}/validar-notificacion', [PersonalController::class, 'validarParaNotificacion']);
        Route::post('/{id}/asegurar-acceso', [PersonalController::class, 'asegurarAccesoSistema']);
        
        // Acciones especiales
        Route::post('/{id}/marcar-cesado', [PersonalController::class, 'marcarCesado'])
            ->middleware('permission:personal.manage');
        Route::post('/{id}/reactivar', [PersonalController::class, 'reactivar'])
            ->middleware('permission:personal.manage');
        
        // CRUD protegido
        Route::middleware('permission:personal.manage')->group(function () {
            Route::post('/', [PersonalController::class, 'store']);
            Route::put('/{id}', [PersonalController::class, 'update']);
            Route::delete('/{id}', [PersonalController::class, 'destroy']);
        });
    });

    // Registros
    Route::prefix('registros')->group(function () {
        Route::get('/', [RegistroController::class, 'index']);
        Route::post('/', [RegistroController::class, 'store']);
        Route::get('/estadisticas', [RegistroController::class, 'estadisticas']);
        Route::get('/{id}', [RegistroController::class, 'show']);
        Route::put('/{id}', [RegistroController::class, 'update']);
        Route::delete('/{id}', [RegistroController::class, 'destroy']);
    });

    // Usuarios (español para frontend)
    Route::prefix('usuarios')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::get('/{id}', [UserController::class, 'show']);
        Route::middleware('permission:users.manage')->group(function () {
            Route::post('/', [UserController::class, 'store']);
            Route::put('/{id}', [UserController::class, 'update']);
            Route::delete('/{id}', [UserController::class, 'destroy']);
            Route::post('/{id}/roles', [UserController::class, 'assignRole']);
            Route::delete('/{id}/roles/{roleId}', [UserController::class, 'removeRole']);
        });
    });

    // Roles (español para frontend)
    Route::prefix('roles')->group(function () {
        Route::get('/', [RoleController::class, 'index']);
        Route::get('/{id}', [RoleController::class, 'show']);
        Route::middleware('permission:roles.manage')->group(function () {
            Route::post('/', [RoleController::class, 'store']);
            Route::put('/{id}', [RoleController::class, 'update']);
            Route::delete('/{id}', [RoleController::class, 'destroy']);
        });
    });

    // Permisos
    Route::get('/permisos', [RoleController::class, 'permissions']);

    // Rutas antiguas para compatibilidad
    Route::middleware('permission:users.manage')->prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::get('/estadisticas', [UserController::class, 'estadisticas']);
        Route::get('/{id}', [UserController::class, 'show']);
        Route::put('/{id}', [UserController::class, 'update']);
        Route::post('/{id}/toggle-active', [UserController::class, 'toggleActive']);
        Route::post('/{id}/assign-role', [UserController::class, 'assignRole']);
        Route::post('/{id}/remove-role', [UserController::class, 'removeRole']);
    });
});
