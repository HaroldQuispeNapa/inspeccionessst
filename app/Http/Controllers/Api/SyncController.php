<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Registro;
use App\Models\Inspeccion;
use App\Models\InspeccionArea;
use App\Models\InspeccionInspector;
use App\Models\ResultadoInspeccion;
use App\Helpers\ImageHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class SyncController extends Controller
{
    /**
     * Sincronizar registros pendientes desde el cliente
     * Recibe un array de registros creados offline y los almacena en el servidor
     */
    public function syncRegistros(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'registros' => 'required|array',
            'registros.*.local_id' => 'required|string|uuid',
            'registros.*.campania_id' => 'required|exists:campanias,id',
            'registros.*.fundo_id' => 'required|exists:fundos,id',
            'registros.*.cantidad' => 'required|numeric|min:0',
            'registros.*.numero_tractor' => 'nullable|string|max:255',
            'registros.*.observaciones' => 'nullable|string',
            'registros.*.fecha_registro' => 'required|date',
            'registros.*.created_at' => 'nullable|date',
            'registros.*.updated_at' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $registrosRecibidos = $request->registros;
        $resultados = [
            'sincronizados' => [],
            'duplicados' => [],
            'errores' => [],
        ];

        DB::beginTransaction();

        try {
            foreach ($registrosRecibidos as $registroData) {
                $localId = $registroData['local_id'];

                // Verificar si ya existe por local_id (identificador único generado en el cliente)
                $existente = Registro::where('local_id', $localId)->first();

                if ($existente) {
                    // Ya existe, verificar timestamps para evitar sobrescribir datos más recientes
                    $updatedAtServidor = $existente->updated_at; // Carbon instance en UTC
                    $updatedAtCliente = isset($registroData['updated_at'])
                        ? \Carbon\Carbon::parse($registroData['updated_at'])->setTimezone('UTC')
                        : null;

                    // Si el cliente tiene un timestamp más antiguo que el servidor, hay conflicto
                    if ($updatedAtCliente && $updatedAtCliente->lt($updatedAtServidor)) {
                        $resultados['errores'][] = [
                            'local_id' => $localId,
                            'server_id' => $existente->id,
                            'message' => 'Conflicto: el registro en el servidor es más reciente',
                            'conflict' => true,
                            'server_updated_at' => $updatedAtServidor->toISOString(),
                            'client_updated_at' => $updatedAtCliente->format('c'),
                        ];
                        continue;
                    }

                    // Si llegamos aquí, el cliente es más reciente o igual, procedemos a actualizar
                    $datosActualizacion = [
                        'campania_id' => $registroData['campania_id'],
                        'fundo_id' => $registroData['fundo_id'],
                        'cantidad' => $registroData['cantidad'],
                        'numero_tractor' => $registroData['numero_tractor'] ?? null,
                        'observaciones' => $registroData['observaciones'] ?? null,
                        // 'fecha_registro' => $registroData['fecha_registro'],
                        // Mantener la fecha_registro original para no perder la referencia temporal
                        'synced' => true,
                        'synced_at' => now(),
                        'updated_at' => $updatedAtCliente ?? now(),
                    ];

                    // Actualizar el registro existente
                    $existente->update($datosActualizacion);

                    $resultados['sincronizados'][] = [
                        'local_id' => $localId,
                        'server_id' => $existente->id,
                        'message' => 'Registro actualizado exitosamente',
                    ];
                    continue;
                }

                // Crear nuevo registro
                $nuevoRegistro = Registro::create([
                    'local_id' => $localId,
                    'user_id' => $user->id,
                    'campania_id' => $registroData['campania_id'],
                    'fundo_id' => $registroData['fundo_id'],
                    'cantidad' => $registroData['cantidad'],
                    'numero_tractor' => $registroData['numero_tractor'] ?? null,
                    'observaciones' => $registroData['observaciones'] ?? null,
                    'fecha_registro' => $registroData['fecha_registro'],
                    'synced' => true,
                    'synced_at' => now(),
                    'created_at' => $registroData['created_at'] ?? now(),
                    'updated_at' => $registroData['updated_at'] ?? now(),
                ]);

                $resultados['sincronizados'][] = [
                    'local_id' => $localId,
                    'server_id' => $nuevoRegistro->id,
                    'message' => 'Registro sincronizado exitosamente',
                ];
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Sincronización completada',
                'data' => $resultados,
                'summary' => [
                    'total_recibidos' => count($registrosRecibidos),
                    'sincronizados' => count($resultados['sincronizados']),
                    'duplicados' => count($resultados['duplicados']),
                    'errores' => count($resultados['errores']),
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'message' => 'Error durante la sincronización',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Eliminar una inspección en el servidor por su local_id
     * Este endpoint facilita que el cliente pueda pedir borrados usando local_id
     */
    public function deleteInspeccionByLocalId(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'local_id' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $localId = $request->input('local_id');

            $inspeccion = Inspeccion::where('local_id', $localId)->first();

            if (!$inspeccion) {
                return response()->json([
                    'success' => false,
                    'message' => 'Inspección no encontrada en el servidor',
                ], 404);
            }

            // Opcional: verificar permisos/propiedad (por ahora se permite al usuario autenticado)
            $inspeccion->delete();

            return response()->json([
                'success' => true,
                'message' => 'Inspección eliminada en servidor',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al eliminar inspección',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Obtener datos necesarios para trabajar offline
     * Descarga catálogos (campañas, fundos, empresas, áreas)
     */
    public function downloadCatalogos(Request $request)
    {
        try {
            $catalogos = [
                'campanias' => \App\Models\Campania::where('activo', true)->orderBy('anio_inicio', 'desc')->get(),
                'fundos' => \App\Models\Fundo::where('activo', true)->orderBy('nombre')->get(),
                'empresas' => \App\Models\Empresa::where('activo', true)->orderBy('name')->get(),
                'areas' => \App\Models\Area::with('empresa:id,name')->where('activo', true)->orderBy('name')->get(),
                'cargos' => \App\Models\Cargo::with('empresa:id,name')->where('estado', true)->orderBy('name')->get(),
                'tipos_trabajador' => \App\Models\TipoDeTrabajador::with('empresa:id,name')
                    ->where('estado', 1)
                    ->orderBy('name')
                    ->get(),
                'tipos_personal' => \App\Models\TipoDePersonal::with('empresa:id,name')
                    ->where('estado', 1)
                    ->orderBy('name')
                    ->get(),
                'planillas' => \App\Models\Planilla::with('empresa:id,name')
                    ->where('estado', 1)
                    ->orderBy('name')
                    ->get(),
                // Personal activo (no cesado) - para selects de inspectores/responsables
                'personal' => \App\Models\Personal::select([
                    'id',
                    'dni',
                    'nombres',
                    'apellido_paterno',
                    'apellido_materno',
                    'empresa_id',
                    'area_id',
                    'cargo_id',
                    'inspector',
                    'cesado',
                    'correo_empresa',
                    'name'
                ])
                    ->where('cesado', false)
                    ->orderBy('nombres')
                    ->get(),
            ];

            return response()->json([
                'success' => true,
                'message' => 'Catálogos descargados exitosamente',
                'data' => $catalogos,
                'timestamp' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al descargar catálogos',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Obtener registros del servidor que no están en el cliente
     * Para sincronización bidireccional (servidor -> cliente)
     */
    public function downloadRegistros(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'ultima_sincronizacion' => 'nullable|date',
            'limit' => 'nullable|integer|min:1|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $query = Registro::porUsuario($user->id)
                ->conRelaciones()
                ->ordenadoPorReciente();

            // Si se proporciona última sincronización, solo enviar los más recientes
            if ($request->filled('ultima_sincronizacion')) {
                $query->where('updated_at', '>', $request->ultima_sincronizacion);
            }

            // Limitar resultados
            $limit = $request->input('limit', 100);
            $registros = $query->limit($limit)->get();

            return response()->json([
                'success' => true,
                'message' => 'Registros descargados exitosamente',
                'data' => $registros,
                'total' => $registros->count(),
                'timestamp' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al descargar registros',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Verificar estado de sincronización del usuario
     */
    public function checkStatus(Request $request)
    {
        $user = $request->user();

        try {
            $totalRegistros = Registro::porUsuario($user->id)->count();
            $registrosSincronizados = Registro::porUsuario($user->id)->sincronizado()->count();
            $registrosPendientes = Registro::porUsuario($user->id)->pendienteSincronizacion()->count();

            $ultimoRegistro = Registro::porUsuario($user->id)
                ->ordenadoPorReciente()
                ->first();

            return response()->json([
                'success' => true,
                'data' => [
                    'total_registros' => $totalRegistros,
                    'sincronizados' => $registrosSincronizados,
                    'pendientes' => $registrosPendientes,
                    'ultima_actualizacion' => $ultimoRegistro ? $ultimoRegistro->updated_at : null,
                    'timestamp_servidor' => now()->toIso8601String(),
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al verificar estado',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Sincronizar inspecciones pendientes desde el cliente
     * Recibe un array de inspecciones creadas offline y las almacena en el servidor
     */
    public function syncInspecciones(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'inspecciones' => 'required|array',
            'inspecciones.*.local_id' => 'required|string|uuid',
            'inspecciones.*.empresa_id' => 'nullable|exists:empresas,id',
            'inspecciones.*.area_id' => 'nullable|exists:areas,id',
            'inspecciones.*.tipo_inspeccion' => 'required|string',
            'inspecciones.*.categoria' => ['nullable', 'string', 'max:80', Rule::in(Inspeccion::CATEGORIAS)],
            'inspecciones.*.placa' => 'nullable|string|max:20',
            'inspecciones.*.tipo_inspeccion_otro' => 'nullable|string',
            'inspecciones.*.vigencia_desde' => 'nullable|date',
            'inspecciones.*.vigencia_hasta' => 'nullable|date',
            'inspecciones.*.razon_social' => 'nullable|string',
            'inspecciones.*.ruc' => 'nullable|string',
            'inspecciones.*.domicilio' => 'nullable|string',
            'inspecciones.*.actividad_economica' => 'nullable|string',
            'inspecciones.*.zona_inspeccionada' => 'nullable|string',
            'inspecciones.*.numero_registro' => 'required|string',
            'inspecciones.*.fecha_hora_inspeccion' => 'required|date',
            'inspecciones.*.comentario' => 'nullable|string',
            'inspecciones.*.fundo_id' => 'nullable|exists:fundos,id',
            'inspecciones.*.objetivo' => 'nullable|string',
            'inspecciones.*.descripcion_causa' => 'nullable|string',
            'inspecciones.*.conclusiones_recomendaciones' => 'nullable|string',
            'inspecciones.*.created_at' => 'nullable|date',
            'inspecciones.*.updated_at' => 'nullable|date',
            // Relaciones
            'inspecciones.*.areas' => 'nullable|array',
            'inspecciones.*.areas.*.area_id' => 'required|exists:areas,id',
            'inspecciones.*.inspectores' => 'nullable|array',
            'inspecciones.*.inspectores.*.personal_id' => 'required|exists:personal,id',
            'inspecciones.*.resultados' => 'nullable|array',
            'inspecciones.*.resultados.*.local_id' => 'required|string|uuid',
            'inspecciones.*.resultados.*.descripcion' => 'required|string',
            'inspecciones.*.resultados.*.nivel_riesgo' => 'required|in:Alto,Medio,Bajo',
            'inspecciones.*.resultados.*.estado' => 'nullable|in:Pendiente,En Proceso,Ejecutado,Cerrado,Cumplimiento,Buena Práctica',
        ], [
            'inspecciones.*.categoria.in' => 'La categoría seleccionada no está permitida. Revisa la categoría de la inspección.',
            'inspecciones.*.categoria.string' => 'La categoría de la inspección debe ser un texto.',
            'inspecciones.*.categoria.max' => 'La categoría de la inspección no puede superar 80 caracteres.',
            'inspecciones.*.placa.max' => 'La placa no puede superar 20 caracteres.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $inspeccionesRecibidas = $request->inspecciones;
        $resultados = [
            'sincronizados' => [],
            'duplicados' => [],
            'errores' => [],
        ];

        DB::beginTransaction();

        try {
            foreach ($inspeccionesRecibidas as $inspeccionData) {
                $localId = $inspeccionData['local_id'];

                // Verificar si ya existe por local_id (identificador único generado en el cliente)
                // IMPORTANTE: NO usar orWhere('id', ...) porque el cliente envía el id auto-incremental
                // de IndexedDB, que NO corresponde al id del servidor y puede coincidir con otra inspección
                $existente = Inspeccion::withTrashed()
                    ->where('local_id', $localId)
                    ->first();

                if ($existente) {
                    $wasTrashed = method_exists($existente, 'trashed') && $existente->trashed();

                    if ($wasTrashed) {
                        // El registro estaba eliminado pero el cliente no lo sabe aún.
                        // Restaurar SIN tocar updated_at para no generar conflicto falso.
                        $existente->timestamps = false;
                        $existente->deleted_at = null;
                        $existente->save();
                        $existente->timestamps = true;
                        // Refrescar el modelo para tener el updated_at original (antes del delete)
                        $existente->refresh();
                    }

                    // Verificar timestamps para evitar sobrescribir datos más recientes
                    $updatedAtServidor = $existente->updated_at; // Carbon instance en UTC
                    $updatedAtCliente = isset($inspeccionData['updated_at'])
                        ? \Carbon\Carbon::parse($inspeccionData['updated_at'])->setTimezone('UTC')
                        : null;

                    // Solo verificar conflicto si NO estaba eliminado.
                    // Si estaba eliminado, el cliente no sabía del delete, así que aceptamos su update.
                    if (!$wasTrashed && $updatedAtCliente && $updatedAtCliente->lt($updatedAtServidor)) {
                        $resultados['errores'][] = [
                            'local_id' => $localId,
                            'server_id' => $existente->id,
                            'message' => 'Conflicto: la inspección ' . $existente->numero_registro . ' en el servidor es más reciente',
                            'conflict' => true,
                            'server_updated_at' => $updatedAtServidor->toISOString(),
                            'client_updated_at' => $updatedAtCliente->format('c'),
                        ];
                        continue;
                    }

                    // Si llegamos aquí, el cliente es más reciente o igual, procedemos a actualizar
                    $datosActualizacion = [
                        'fundo_id' => $inspeccionData['fundo_id'] ?? null,
                        'empresa_id' => $inspeccionData['empresa_id'] ?? null,
                        'area_id' => $inspeccionData['area_id'] ?? null,
                        'tipo_inspeccion' => $inspeccionData['tipo_inspeccion'],
                        'categoria' => $inspeccionData['categoria'] ?? $existente->categoria,
                        // Omitir el campo conserva la placa; enviar null permite quitarla.
                        'placa' => array_key_exists('placa', $inspeccionData) ? $inspeccionData['placa'] : $existente->placa,
                        'tipo_inspeccion_otro' => $inspeccionData['tipo_inspeccion_otro'] ?? null,
                        'vigencia_desde' => $inspeccionData['vigencia_desde'] ?? null,
                        'vigencia_hasta' => $inspeccionData['vigencia_hasta'] ?? null,
                        'razon_social' => $inspeccionData['razon_social'] ?? null,
                        'ruc' => $inspeccionData['ruc'] ?? null,
                        'domicilio' => $inspeccionData['domicilio'] ?? null,
                        'actividad_economica' => $inspeccionData['actividad_economica'] ?? null,
                        'zona_inspeccionada' => $inspeccionData['zona_inspeccionada'] ?? null,
                        'numero_registro' => $inspeccionData['numero_registro'] ?? null,
                        'fecha_hora_inspeccion' => $inspeccionData['fecha_hora_inspeccion'],
                        'comentario' => $inspeccionData['comentario'] ?? null,
                        'objetivo' => $inspeccionData['objetivo'] ?? null,
                        'descripcion_causa' => $inspeccionData['descripcion_causa'] ?? null,
                        'conclusiones_recomendaciones' => $inspeccionData['conclusiones_recomendaciones'] ?? null,
                        'synced' => true,
                        'synced_at' => now(),
                        'updated_at' => $updatedAtCliente ?? now(),
                    ];

                    // Actualizar la inspección existente
                    $existente->update($datosActualizacion);

                    // Sincronizar relaciones (áreas, inspectores, resultados)
                    $this->sincronizarRelaciones($existente, $inspeccionData);

                    $resultados['sincronizados'][] = [
                        'local_id' => $localId,
                        'server_id' => $existente->id,
                        'message' => 'Inspección actualizada exitosamente',
                    ];
                    continue;
                }

                // Crear nueva inspección
                $nuevaInspeccion = Inspeccion::create([
                    'fundo_id' => $inspeccionData['fundo_id'] ?? null,
                    'local_id' => $localId,
                    'user_id' => $user->id,
                    'empresa_id' => $inspeccionData['empresa_id'] ?? null,
                    'area_id' => $inspeccionData['area_id'] ?? null,
                    'tipo_inspeccion' => $inspeccionData['tipo_inspeccion'],
                    'categoria' => $inspeccionData['categoria'] ?? null,
                    'placa' => $inspeccionData['placa'] ?? null,
                    'tipo_inspeccion_otro' => $inspeccionData['tipo_inspeccion_otro'] ?? null,
                    'vigencia_desde' => $inspeccionData['vigencia_desde'] ?? null,
                    'vigencia_hasta' => $inspeccionData['vigencia_hasta'] ?? null,
                    'razon_social' => $inspeccionData['razon_social'] ?? null,
                    'ruc' => $inspeccionData['ruc'] ?? null,
                    'domicilio' => $inspeccionData['domicilio'] ?? null,
                    'actividad_economica' => $inspeccionData['actividad_economica'] ?? null,
                    'zona_inspeccionada' => $inspeccionData['zona_inspeccionada'] ?? null,
                    'numero_registro' => $inspeccionData['numero_registro'] ?? null,
                    'fecha_hora_inspeccion' => $inspeccionData['fecha_hora_inspeccion'],
                    'comentario' => $inspeccionData['comentario'] ?? null,
                    'objetivo' => $inspeccionData['objetivo'] ?? null,
                    'descripcion_causa' => $inspeccionData['descripcion_causa'] ?? null,
                    'conclusiones_recomendaciones' => $inspeccionData['conclusiones_recomendaciones'] ?? null,
                    'synced' => true,
                    'synced_at' => now(),
                    'created_at' => $inspeccionData['created_at'] ?? now(),
                    'updated_at' => $inspeccionData['updated_at'] ?? now(),
                ]);

                // Sincronizar relaciones (áreas, inspectores, resultados)
                $this->sincronizarRelaciones($nuevaInspeccion, $inspeccionData);

                $resultados['sincronizados'][] = [
                    'local_id' => $localId,
                    'server_id' => $nuevaInspeccion->id,
                    'message' => 'Inspección sincronizada exitosamente',
                ];
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'Sincronización de inspecciones completada',
                'data' => $resultados,
                'summary' => [
                    'total_recibidos' => count($inspeccionesRecibidas),
                    'sincronizados' => count($resultados['sincronizados']),
                    'duplicados' => count($resultados['duplicados']),
                    'errores' => count($resultados['errores']),
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            // Logging detallado para diagnóstico: mensaje, traza, tamaño del payload y preview
            try {
                $inspeccionesCount = is_array($inspeccionesRecibidas) ? count($inspeccionesRecibidas) : null;
                $payloadPreview = null;
                if (isset($inspeccionesRecibidas) && is_array($inspeccionesRecibidas)) {
                    $previewSlice = array_slice($inspeccionesRecibidas, 0, 5);
                    $payloadPreview = json_encode($previewSlice, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
                }
            } catch (\Exception $le) {
                $payloadPreview = 'Could not encode payload preview: ' . $le->getMessage();
                $inspeccionesCount = null;
            }

            Log::error('Error durante la sincronización de inspecciones', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'inspecciones_count' => $inspeccionesCount,
                // 'payload_preview' => $payloadPreview,
                'user_id' => isset($user) && $user ? $user->id : null,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Error durante la sincronización de inspecciones',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Obtener inspecciones del servidor
     * Para sincronización bidireccional (servidor -> cliente)
     */
    public function downloadInspecciones(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'ultima_sincronizacion' => 'nullable|date',
            'limit' => 'nullable|integer|min:1|max:500',
            'per_page' => 'nullable|integer|min:1|max:500',
            'page' => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            // Verificar si el usuario tiene rol de administrador, supervisor o operador
            $esAdminOSupervisor = $user->hasRole('administrador') || $user->hasRole('supervisor') || $user->hasRole('operador');

            // Si es admin, supervisor o operador, obtener todas las inspecciones, sino filtrar por usuario/inspector
            if ($esAdminOSupervisor) {
                $query = Inspeccion::query();
            } else {
                $query = Inspeccion::porUsuarioOInspector($user->id, $user->personal_id);
            }

            $query->with([
                'user:id,name,email',
                'empresa:id,name,razon_social,ruc',
                'area:id,name,empresa_id',
                'areas:id,name',
                'fundo:id,nombre',
                'inspectores:id,nombres,apellido_paterno,apellido_materno,dni',
                'resultados' => function ($q) {
                    $q->orderBy('nivel_riesgo', 'asc'); // Alto primero
                },
                'resultados.visores:id,nombres,apellido_paterno,apellido_materno',
                'resultados.responsablesLevantamiento:id,nombres,apellido_paterno,apellido_materno',
                'resultados.responsable:id,nombres,apellido_paterno,apellido_materno',
                'resultados.comentarios.user:id,name',
                'resultados.fotoFinalAprobador:id,nombres,apellido_paterno,apellido_materno',
                'resultados.fotoInicialAprobador:id,nombres,apellido_paterno,apellido_materno',
                'responsableRegistro.personal:id,nombres,apellido_paterno,apellido_materno',
            ])
                ->orderBy('fecha_hora_inspeccion', 'desc');

            // Si se proporciona última sincronización, solo enviar las más recientes
            if ($request->filled('ultima_sincronizacion')) {
                $query->where('updated_at', '>', $request->ultima_sincronizacion);
            }

            $perPage = (int) $request->input('per_page', $request->input('limit', 250));
            $page = (int) $request->input('page', 1);
            $inspeccionesPaginator = $query->paginate($perPage, ['*'], 'page', $page);
            $inspecciones = collect($inspeccionesPaginator->items());

            // ── Tombstones: inspecciones eliminadas para propagar deletes a otros dispositivos ──
            $deletedQuery = Inspeccion::onlyTrashed()
                ->select('local_id', 'deleted_at');

            if (!$esAdminOSupervisor) {
                $deletedQuery->where('user_id', $user->id);
            }

            if ($request->filled('ultima_sincronizacion')) {
                $deletedQuery->where('deleted_at', '>', $request->ultima_sincronizacion);
            }

            $deletedInspecciones = $deletedQuery
                ->orderBy('deleted_at', 'desc')
                ->limit($perPage)
                ->get();

            return response()->json([
                'success' => true,
                'message' => 'Inspecciones descargadas exitosamente',
                'data' => $inspecciones,
                'deleted' => $deletedInspecciones,
                'total' => $inspeccionesPaginator->total(),
                'pagination' => [
                    'total' => $inspeccionesPaginator->total(),
                    'per_page' => $inspeccionesPaginator->perPage(),
                    'current_page' => $inspeccionesPaginator->currentPage(),
                    'last_page' => $inspeccionesPaginator->lastPage(),
                ],
                'timestamp' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al descargar inspecciones',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Obtener una inspección específica por su local_id.
     * Usado cuando un dispositivo abre una inspección para editar y necesita
     * asegurarse de tener la versión más reciente del servidor.
     */
    public function getInspeccionByLocalId(Request $request, $localId)
    {
        $user = $request->user();

        try {
            $esAdminOSupervisor = $user->hasRole('administrador') || $user->hasRole('supervisor') || $user->hasRole('operador');

            $query = Inspeccion::where('local_id', $localId);

            // Aplicar filtro de permisos si no es admin/supervisor/operador
            if (!$esAdminOSupervisor) {
                $query->where(function ($q) use ($user) {
                    $q->where('user_id', $user->id)
                        ->orWhereHas('inspectores', function ($q2) use ($user) {
                            $q2->where('personal_id', $user->personal_id);
                        });
                });
            }

            $inspeccion = $query->with([
                'user:id,name,email',
                'empresa:id,name,razon_social,ruc',
                'area:id,name,empresa_id',
                'areas:id,name',
                'fundo:id,nombre',
                'inspectores:id,nombres,apellido_paterno,apellido_materno,dni',
                'resultados' => function ($q) {
                    $q->orderBy('nivel_riesgo', 'asc');
                },
                'resultados.visores:id,nombres,apellido_paterno,apellido_materno',
                'resultados.responsablesLevantamiento:id,nombres,apellido_paterno,apellido_materno',
                'resultados.responsable:id,nombres,apellido_paterno,apellido_materno',
                'resultados.comentarios.user:id,name',
                'resultados.fotoFinalAprobador:id,nombres,apellido_paterno,apellido_materno',
                'resultados.fotoInicialAprobador:id,nombres,apellido_paterno,apellido_materno',
                'responsableRegistro.personal:id,nombres,apellido_paterno,apellido_materno',
            ])->first();

            if (!$inspeccion) {
                return response()->json([
                    'success' => false,
                    'message' => 'Inspección no encontrada',
                ], 404);
            }

            return response()->json([
                'success' => true,
                'data' => $inspeccion,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al obtener inspección',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Obtener inspecciones eliminadas (tombstones) para propagar deletes entre dispositivos.
     * Endpoint ligero que se llama en cada ciclo de auto-sync.
     */
    public function getDeletedInspecciones(Request $request)
    {
        $user = $request->user();

        try {
            $esAdminOSupervisor = $user->hasRole('administrador') || $user->hasRole('supervisor') || $user->hasRole('operador');

            $query = Inspeccion::onlyTrashed()
                ->select('local_id', 'deleted_at');

            if (!$esAdminOSupervisor) {
                $query->where('user_id', $user->id);
            }

            // Filtrar por fecha para no devolver tombstones antiguos innecesariamente
            if ($request->filled('since')) {
                $query->where('deleted_at', '>', $request->since);
            }

            $deleted = $query->orderBy('deleted_at', 'desc')->limit(200)->get();

            return response()->json([
                'success' => true,
                'data' => $deleted,
                'total' => $deleted->count(),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al obtener inspecciones eliminadas',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Sincronizar relaciones de una inspección (áreas, inspectores, resultados)
     */
    private function sincronizarRelaciones(Inspeccion $inspeccion, array $data)
    {
        // 1. Sincronizar áreas
        if (isset($data['areas']) && is_array($data['areas'])) {
            // Limpiar áreas existentes
            InspeccionArea::where('inspeccion_id', $inspeccion->id)->delete();

            // Agregar nuevas áreas con local_id
            foreach ($data['areas'] as $areaData) {
                InspeccionArea::create([
                    'local_id' => \Illuminate\Support\Str::uuid(),
                    'inspeccion_id' => $inspeccion->id,
                    'area_id' => $areaData['area_id'],
                ]);
            }
        }

        // 2. Sincronizar inspectores
        if (isset($data['inspectores']) && is_array($data['inspectores'])) {
            $inspectoresRecibidos = collect($data['inspectores'])
                ->filter(fn ($inspectorData) => !empty($inspectorData['personal_id']))
                ->unique('personal_id')
                ->values();

            $personalIdsRecibidos = $inspectoresRecibidos
                ->pluck('personal_id')
                ->map(fn ($personalId) => (int) $personalId)
                ->all();

            // Los inspectores que ya no vienen desde el cliente sí se eliminan físicamente.
            InspeccionInspector::withTrashed()
                ->where('inspeccion_id', $inspeccion->id)
                ->when(count($personalIdsRecibidos) > 0, function ($query) use ($personalIdsRecibidos) {
                    $query->whereNotIn('personal_id', $personalIdsRecibidos);
                })
                ->when(count($personalIdsRecibidos) === 0, function ($query) {
                    $query->whereRaw('1 = 1');
                })
                ->forceDelete();

            foreach ($inspectoresRecibidos as $inspectorData) {
                $inspector = InspeccionInspector::withTrashed()
                    ->where('inspeccion_id', $inspeccion->id)
                    ->where('personal_id', $inspectorData['personal_id'])
                    ->first();

                if (!$inspector) {
                    $inspector = new InspeccionInspector([
                        'local_id' => \Illuminate\Support\Str::uuid(),
                        'inspeccion_id' => $inspeccion->id,
                        'personal_id' => $inspectorData['personal_id'],
                    ]);
                } elseif ($inspector->trashed()) {
                    $inspector->restore();
                }

                if (array_key_exists('fecha_firma', $inspectorData)) {
                    $inspector->fecha_firma = $inspectorData['fecha_firma'];
                }

                if (array_key_exists('firma_digital', $inspectorData)) {
                    $inspector->firma_digital = $inspectorData['firma_digital'];
                }

                $inspector->save();
            }
        }

        // 3. Sincronizar resultados/hallazgos
        if (isset($data['resultados']) && is_array($data['resultados'])) {
            // Obtener los local_ids que vienen del cliente
            $localIdsRecibidos = collect($data['resultados'])
                ->pluck('local_id')
                ->filter()
                ->toArray();

            // Eliminar resultados que ya no existen en el cliente
            // (fueron eliminados por el usuario en el formulario)
            $resultadosAEliminar = ResultadoInspeccion::where('inspeccion_id', $inspeccion->id)
                ->whereNotIn('local_id', $localIdsRecibidos)
                ->get();

            foreach ($resultadosAEliminar as $resultadoEliminar) {
                // Limpiar relaciones del resultado antes de eliminarlo
                \App\Models\ResultadoVisor::where('resultado_id', $resultadoEliminar->id)->forceDelete();
                \App\Models\ResultadoResponsableLevantamiento::where('resultado_id', $resultadoEliminar->id)->forceDelete();
                $resultadoEliminar->forceDelete();
            }

            if (count($resultadosAEliminar) > 0) {
                Log::info("Eliminados " . count($resultadosAEliminar) . " resultados huérfanos de inspección {$inspeccion->id}");
            }

            foreach ($data['resultados'] as $resultadoData) {
                // Buscar por local_id para evitar duplicados
                $resultado = ResultadoInspeccion::where('local_id', $resultadoData['local_id'])->first();

                // Procesar foto inicial: si es base64, guardarla en filesystem
                $fotoInicial = ImageHelper::processImage(
                    $resultadoData['registro_fotografico_inicial'] ?? null,
                    'inspecciones/fotos_iniciales',
                    'inicial_' . ($resultadoData['local_id'] ?? 'img')
                );

                // Procesar foto final: si es base64, guardarla en filesystem
                $fotoFinal = ImageHelper::processImage(
                    $resultadoData['registro_fotografico_final'] ?? null,
                    'inspecciones/fotos_finales',
                    'final_' . ($resultadoData['local_id'] ?? 'img')
                );

                $datosResultado = [
                    'inspeccion_id' => $inspeccion->id,
                    'descripcion' => $resultadoData['descripcion'],
                    'nivel_riesgo' => $resultadoData['nivel_riesgo'],
                    'estado' => $resultadoData['estado'] ?? 'Pendiente',
                    'accion_tomar' => $resultadoData['accion_tomar'] ?? null,
                    'fecha_cierre' => $resultadoData['fecha_cierre'] ?? null,
                    'registro_fotografico_inicial' => $fotoInicial,
                    'registro_fotografico_final' => $fotoFinal,
                    'responsable_id' => $resultadoData['responsable_id'] ?? null,
                    'synced' => true,
                    'synced_at' => now(),
                ];

                if ($resultado) {
                    // Actualizar existente
                    $resultado->update($datosResultado);
                } else {
                    // Crear nuevo
                    $resultado = ResultadoInspeccion::create([
                        'local_id' => $resultadoData['local_id'],
                        ...$datosResultado,
                    ]);
                }

                // 3.1 Sincronizar visores del resultado
                if (isset($resultadoData['visores']) && is_array($resultadoData['visores'])) {
                    // Limpiar visores existentes (forceDelete para eliminar físicamente, no soft delete)
                    \App\Models\ResultadoVisor::where('resultado_id', $resultado->id)->forceDelete();

                    foreach ($resultadoData['visores'] as $visorData) {
                        $personalId = is_array($visorData) ? ($visorData['personal_id'] ?? $visorData['id'] ?? null) : $visorData;
                        if ($personalId) {
                            \App\Models\ResultadoVisor::create([
                                'local_id' => \Illuminate\Support\Str::uuid(),
                                'resultado_id' => $resultado->id,
                                'personal_id' => $personalId,
                            ]);
                        }
                    }
                }

                // 3.2 Sincronizar responsables de levantamiento del resultado
                if (isset($resultadoData['responsablesLevantamiento']) && is_array($resultadoData['responsablesLevantamiento'])) {
                    // Limpiar responsables existentes (forceDelete para eliminar físicamente, no soft delete)
                    \App\Models\ResultadoResponsableLevantamiento::where('resultado_id', $resultado->id)->forceDelete();

                    foreach ($resultadoData['responsablesLevantamiento'] as $respData) {
                        $personalId = is_array($respData) ? ($respData['personal_id'] ?? $respData['id'] ?? null) : $respData;
                        if ($personalId) {
                            \App\Models\ResultadoResponsableLevantamiento::create([
                                'local_id' => \Illuminate\Support\Str::uuid(),
                                'resultado_id' => $resultado->id,
                                'personal_id' => $personalId,
                            ]);
                        }
                    }
                }
            }
        }
    }
}
