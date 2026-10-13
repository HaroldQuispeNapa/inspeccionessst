<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ResultadoInspeccion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use App\Services\NotificationService;

class FotoApprovalController extends Controller
{
    /**
     * Subir foto final de levantamiento (para responsables de levantamiento)
     */
    public function subirFotoFinal(Request $request, $resultadoId)
    {
        $validator = Validator::make($request->all(), [
            'foto' => 'required|string', // Base64
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $resultado = ResultadoInspeccion::with(['responsablesLevantamiento'])->findOrFail($resultadoId);
        $user = $request->user();

        // Verificar que el usuario sea responsable de levantamiento del resultado
        // Nota: responsablesLevantamiento retorna objetos Personal con 'id', no 'personal_id'
        $esResponsableLevantamiento = $resultado->responsablesLevantamiento
            ->contains('id', $user->personal_id) ||
            ($user->personal_id && (int) $resultado->responsable_id === (int) $user->personal_id);

        if (!$esResponsableLevantamiento && !$user->hasRole('Administrador')) {
            return response()->json([
                'success' => false,
                'message' => 'Solo los responsables de levantamiento pueden subir la foto final',
            ], 403);
        }

        // Verificar que el resultado esté en estado Pendiente o que la foto haya sido rechazada
        if ($resultado->estado !== 'Pendiente' && $resultado->foto_final_estado !== 'rechazada') {
            return response()->json([
                'success' => false,
                'message' => 'Solo se puede subir foto en resultados pendientes o con foto rechazada',
            ], 400);
        }

        try {
            // Procesar imagen base64
            $fotoBase64 = $request->foto;
            $extension = 'jpg';
            
            // Remover el prefijo data:image si existe
            if (preg_match('/^data:image\/(\w+);base64,/', $fotoBase64, $type)) {
                $extension = ['jpeg' => 'jpg', 'jpg' => 'jpg', 'png' => 'png', 'webp' => 'webp', 'gif' => 'gif'][strtolower($type[1])] ?? 'jpg';
                $fotoBase64 = substr($fotoBase64, strpos($fotoBase64, ',') + 1);
            }
            
            $fotoData = base64_decode($fotoBase64);
            
            if ($fotoData === false) {
                return response()->json([
                    'success' => false,
                    'message' => 'Error al decodificar la imagen',
                ], 400);
            }

            // Generar nombre único
            $filename = 'levantamiento_' . $resultadoId . '_' . Str::random(10) . '.' . $extension;
            $path = 'inspecciones/fotos_finales/' . $filename;
            
            // Guardar archivo
            Storage::disk('public')->put($path, $fotoData);

            // Actualizar resultado
            $resultado->update([
                'registro_fotografico_final' => $path,
                'foto_final_estado' => 'pendiente',
                'foto_final_comentario' => null,
                'foto_final_aprobador_id' => null,
                'foto_final_aprobada_at' => null,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Foto de levantamiento subida correctamente. Pendiente de validación por el inspector.',
                'data' => [
                    'registro_fotografico_final' => $path,
                    'foto_final_estado' => 'pendiente',
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al guardar la imagen: ' . $e->getMessage(),
            ], 500);
        }
    }

    protected $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * Aprobar o rechazar foto inicial
     */
    public function aprobarFotoInicial(Request $request, $resultadoId)
    {
        $validator = Validator::make($request->all(), [
            'accion' => 'required|in:aprobar,rechazar',
            'comentario' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $resultado = ResultadoInspeccion::findOrFail($resultadoId);
        $user = $request->user();

        // Verificar que el usuario sea inspector en la inspección
        $inspeccion = $resultado->inspeccion()->with('inspectores')->first();
        $esInspector = $inspeccion->inspectores->contains('id', $user->personal_id);

        if (!$esInspector && !$user->hasRole('Administrador')) {
            return response()->json([
                'success' => false,
                'message' => 'Solo los inspectores asignados pueden aprobar/rechazar fotos',
            ], 403);
        }

        // Verificar que haya foto
        if (!$resultado->registro_fotografico_inicial) {
            return response()->json([
                'success' => false,
                'message' => 'No hay foto inicial para aprobar',
            ], 400);
        }

        // Actualizar estado
        $estado = $request->accion === 'aprobar' ? 'aprobada' : 'rechazada';
        
        $resultado->update([
            'foto_inicial_estado' => $estado,
            'foto_inicial_comentario' => $request->comentario,
            'foto_inicial_aprobador_id' => $user->personal_id,
            'foto_inicial_aprobada_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => $request->accion === 'aprobar' 
                ? 'Foto inicial aprobada correctamente' 
                : 'Foto inicial rechazada',
            'data' => $resultado->fresh(['fotoInicialAprobador']),
        ]);
    }

    /**
     * Aprobar o rechazar foto final
     */
    public function aprobarFotoFinal(Request $request, $resultadoId)
    {
        // Valida que la petición indique una acción permitida y que el comentario,
        // si existe, no supere el tamaño esperado.
        $validator = Validator::make($request->all(), [
            'accion' => 'required|in:aprobar,rechazar',
            'comentario' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        // Carga el resultado que se está validando y el usuario autenticado
        // que intenta aprobar o rechazar la foto final.
        $resultado = ResultadoInspeccion::findOrFail($resultadoId);
        $user = $request->user();

        // Solo un inspector asignado a la inspección, o un administrador,
        // puede validar la foto final del resultado.
        $inspeccion = $resultado->inspeccion()->with('inspectores')->first();
        $esInspector = $inspeccion->inspectores->contains('id', $user->personal_id);

        if (!$esInspector && !$user->hasRole('Administrador')) {
            return response()->json([
                'success' => false,
                'message' => 'Solo los inspectores asignados pueden aprobar/rechazar fotos',
            ], 403);
        }

        // No tiene sentido aprobar o rechazar si todavía no existe una foto final subida.
        if (!$resultado->registro_fotografico_final) {
            return response()->json([
                'success' => false,
                'message' => 'No hay foto final para aprobar',
            ], 400);
        }

        // Traducimos la acción recibida a un estado persistible en base de datos.
        $estado = $request->accion === 'aprobar' ? 'aprobada' : 'rechazada';
        
        // Estos campos registran el resultado de la validación, quién la hizo
        // y cuándo ocurrió.
        $updateData = [
            'foto_final_estado' => $estado,
            'foto_final_comentario' => $request->comentario,
            'foto_final_aprobador_id' => $user->personal_id,
            'foto_final_aprobada_at' => now(),
        ];

        // Si la foto final queda aprobada, el hallazgo se considera ejecutado
        // y se marca también la fecha de cierre.
        if ($request->accion === 'aprobar') {
            $updateData['estado'] = 'Ejecutado';
            // Actualizamos fecha de cierre para dejar trazabilidad del cierre real.
            $updateData['fecha_cierre'] = now();
        }

        // Persistimos todos los cambios en un solo update.
        $resultado->update($updateData);

        // Después de validar la foto, intentamos notificar a las personas vinculadas
        // al resultado para que vean el nuevo estado.
        try {
            // Recargamos la inspección con las relaciones necesarias para que el servicio
            // de notificaciones pueda construir correctamente el contexto del mensaje.
            $inspeccion = $resultado->inspeccion()->with([
                'empresa',
                'area',
                'resultados.responsable',
                'resultados.visores',
                'resultados.responsablesLevantamiento',
            ])->first();

            // Reunimos todos los destinatarios relacionados con este resultado:
            // responsable principal, responsables de levantamiento y visores.
            $personalIds = [];
            if ($resultado->responsable_id) {
                $personalIds[] = $resultado->responsable_id;
            }
            if ($resultado->responsablesLevantamiento) {
                foreach ($resultado->responsablesLevantamiento as $r) {
                    // Los objetos Personal cargados en la relación usan 'id'.
                    $personalIds[] = $r->id ?? null;
                }
            }

            if ($resultado->visores) {
                foreach ($resultado->visores as $v) {
                    // Los visores también llegan como objetos Personal con 'id'.
                    $personalIds[] = $v->id ?? null;
                }
            }

            // Eliminamos nulos y duplicados antes de enviar notificaciones.
            $personalIds = array_values(array_filter(array_unique($personalIds)));

            // Solo llamamos al servicio si realmente hay destinatarios y contexto de inspección.
            if (!empty($personalIds) && $inspeccion) {
                $notiResult = $this->notificationService->enviarNotificacionesInspeccionParaPersonal($inspeccion, $personalIds);
            }
        } catch (\Exception $e) {
            // La validación principal ya ocurrió; un fallo notificando no debe romper la respuesta.
            Log::error('Error al enviar notificaciones después de validar foto final: ' . $e->getMessage());
        }

        // Devolvemos el resultado actualizado y, si existió, el resultado del envío de notificaciones.
        return response()->json([
            'success' => true,
            'message' => $request->accion === 'aprobar' 
                ? 'Foto final aprobada correctamente. El resultado ha sido marcado como Ejecutado.' 
                : 'Foto final rechazada. El responsable debe subir una nueva foto.',
            'data' => $resultado->fresh(['fotoFinalAprobador']),
            'notificacion' => $notiResult ?? null,
        ]);
    }

    /**
     * Obtener historial de aprobaciones
     */
    public function obtenerHistorial($resultadoId)
    {
        $resultado = ResultadoInspeccion::with([
            'fotoInicialAprobador',
            'fotoFinalAprobador',
        ])->findOrFail($resultadoId);

        return response()->json([
            'success' => true,
            'data' => [
                'foto_inicial' => [
                    'estado' => $resultado->foto_inicial_estado,
                    'comentario' => $resultado->foto_inicial_comentario,
                    'aprobador' => $resultado->fotoInicialAprobador,
                    'aprobada_at' => $resultado->foto_inicial_aprobada_at,
                ],
                'foto_final' => [
                    'estado' => $resultado->foto_final_estado,
                    'comentario' => $resultado->foto_final_comentario,
                    'aprobador' => $resultado->fotoFinalAprobador,
                    'aprobada_at' => $resultado->foto_final_aprobada_at,
                ],
            ],
        ]);
    }
}
