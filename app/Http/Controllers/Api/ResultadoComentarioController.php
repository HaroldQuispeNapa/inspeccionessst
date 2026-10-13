<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ResultadoInspeccion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ResultadoComentarioController extends Controller
{
    public function store(Request $request, string $id)
    {
        $resultado = ResultadoInspeccion::with('inspeccion')->findOrFail($id);
        abort_unless($resultado->inspeccion, 404);
        $user = $request->user();
        $personalId = $user->personal_id;
        $esResponsable = $personalId && (
            (int) $resultado->responsable_id === (int) $personalId ||
            $resultado->responsablesLevantamiento()->where('personal.id', $personalId)->exists()
        );

        if (!$esResponsable && !$user->hasRole('Administrador')) {
            return response()->json([
                'success' => false,
                'message' => 'Solo los responsables asignados pueden registrar comentarios.',
            ], 403);
        }

        $request->merge(['contenido' => is_string($request->contenido) ? trim($request->contenido) : $request->contenido]);
        $data = $request->validate(['contenido' => 'required|string|max:2000']);

        $comentario = DB::transaction(function () use ($resultado, $user, $data) {
            $comentario = $resultado->comentarios()->create([
                'user_id' => $user->id,
                'contenido' => $data['contenido'],
            ]);
            // Permitir que la sincronización incremental descargue el comentario nuevo.
            $resultado->touch();
            $resultado->inspeccion->touch();

            return $comentario;
        });

        return response()->json([
            'success' => true,
            'message' => 'Comentario registrado.',
            'data' => $comentario->load('user:id,name'),
        ], 201);
    }
}
