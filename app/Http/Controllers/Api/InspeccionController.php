<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inspeccion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;

class InspeccionController extends Controller
{
    /**
     * Listar inspecciones del usuario autenticado
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Inspeccion::query();

        // Filtrar por usuario autenticado
        $query->porUsuario($user->id);

        // Filtrar por estado de sincronización
        if ($request->has('synced')) {
            if ($request->boolean('synced')) {
                $query->sincronizado();
            } else {
                $query->pendienteSincronizacion();
            }
        }

        // Filtrar por empresa
        if ($request->filled('empresa_id')) {
            $query->porEmpresa($request->empresa_id);
        }

        // Filtrar por área
        if ($request->filled('area_id')) {
            $query->porArea($request->area_id);
        }

        // Filtrar por rango de fechas
        if ($request->filled('fecha_inicio')) {
            $fechaFin = $request->fecha_fin ?? $request->fecha_inicio;
            $query->porFecha($request->fecha_inicio, $fechaFin);
        }

        // Incluir relaciones
        $query->conRelaciones();

        // Ordenar por más reciente
        $query->latest('created_at');

        // Paginación
        $perPage = $request->input('per_page', 50);
        $inspecciones = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $inspecciones->items(),
            'pagination' => [
                'total' => $inspecciones->total(),
                'per_page' => $inspecciones->perPage(),
                'current_page' => $inspecciones->currentPage(),
                'last_page' => $inspecciones->lastPage(),
            ],
        ]);
    }

    /**
     * Crear nueva inspección (online u offline)
     */
    public function store(Request $request)
    {
        $user = $request->user();

        $validator = Validator::make($request->all(), [
            'local_id' => 'nullable|string|uuid',
            'empresa_id' => 'required|exists:empresas,id',
            'area_id' => 'required|exists:areas,id',
            'tipo_inspeccion' => 'required|in:Planeada,No Planeada,Otro',
            'categoria' => ['nullable', 'string', 'max:80', Rule::in(Inspeccion::CATEGORIAS)],
            'placa' => 'nullable|string|max:20',
            'fundo_id' => 'nullable|exists:fundos,id',
            'tipo_inspeccion_otro' => 'nullable|string|max:250',
            'vigencia_desde' => 'nullable|date',
            'vigencia_hasta' => 'nullable|date|after_or_equal:vigencia_desde',
            'razon_social' => 'nullable|string|max:250',
            'ruc' => 'nullable|string|max:11',
            'domicilio' => 'nullable|string',
            'actividad_economica' => 'nullable|string|max:250',
            'zona_inspeccionada' => 'nullable|string',
            'numero_registro' => 'nullable|string|max:100',
            'fecha_inspeccion' => 'nullable|date',
            'hora_inspeccion' => 'nullable|date_format:H:i:s',
            'comentario' => 'nullable|string',
            'objetivo' => 'nullable|string',
            'descripcion_causa' => 'nullable|string',
            'conclusiones_recomendaciones' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $data = $validator->validated();
        $data['user_id'] = $user->id;

        // Si viene de sincronización offline, verificar que no exista ya por local_id
        if (isset($data['local_id'])) {
            $existente = Inspeccion::where('local_id', $data['local_id'])->first();
            if ($existente) {
                return response()->json([
                    'success' => true,
                    'message' => 'Inspección ya existe (sincronizada previamente)',
                    'data' => $existente->load(['empresa', 'area']),
                ], 200);
            }
        }

        // Si es creación desde el servidor, marcar como sincronizado
        if (!$request->has('local_id')) {
            $data['synced'] = true;
            $data['synced_at'] = now();
        }

        $inspeccion = Inspeccion::create($data);
        $inspeccion->load(['empresa', 'area']);

        return response()->json([
            'success' => true,
            'message' => 'Inspección creada exitosamente',
            'data' => $inspeccion,
        ], 201);
    }

    /**
     * Mostrar una inspección específica
     */
    public function show(Request $request, string $id)
    {
        $user = $request->user();
        
        $inspeccion = Inspeccion::conRelaciones()
            ->where('id', $id)
            ->first();

        if (!$inspeccion) {
            return response()->json([
                'success' => false,
                'message' => 'Inspección no encontrada',
            ], 404);
        }

        // Verificar permisos: creador, inspector o personal asignado
        $personalId = $user->personal_id;
        $esCreador = $inspeccion->user_id === $user->id;
        $esInspector = $inspeccion->inspectores->contains('id', $personalId);
        $esAsignado = $inspeccion->resultados->contains(function ($resultado) use ($personalId) {
            return $resultado->responsable_id === $personalId ||
                   $resultado->visores->contains('id', $personalId) ||
                   $resultado->responsablesLevantamiento->contains('id', $personalId);
        });
        $esAdmin = $user->hasRole('Administrador');

        if (!$esCreador && !$esInspector && !$esAsignado && !$esAdmin) {
            return response()->json([
                'success' => false,
                'message' => 'No tienes permiso para ver esta inspección',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $inspeccion,
        ]);
    }

    /**
     * Actualizar una inspección
     */
    public function update(Request $request, string $id)
    {
        $user = $request->user();
        
        $inspeccion = Inspeccion::find($id);

        if (!$inspeccion) {
            return response()->json([
                'success' => false,
                'message' => 'Inspección no encontrada',
            ], 404);
        }

        // Verificar que la inspección pertenezca al usuario
        if ($inspeccion->user_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'No tienes permiso para editar esta inspección',
            ], 403);
        }

        $validator = Validator::make($request->all(), [
            'empresa_id' => 'sometimes|required|exists:empresas,id',
            'fundo_id' => 'nullable|exists:fundos,id',
            'area_id' => 'sometimes|required|exists:areas,id',
            'tipo_inspeccion' => 'sometimes|required|in:Planeada,No Planeada,Otro',
            'categoria' => ['nullable', 'string', 'max:80', Rule::in(Inspeccion::CATEGORIAS)],
            'placa' => 'nullable|string|max:20',
            'tipo_inspeccion_otro' => 'nullable|string|max:250',
            'vigencia_desde' => 'nullable|date',
            'vigencia_hasta' => 'nullable|date',
            'razon_social' => 'nullable|string|max:250',
            'ruc' => 'nullable|string|max:11',
            'domicilio' => 'nullable|string',
            'actividad_economica' => 'nullable|string|max:250',
            'zona_inspeccionada' => 'nullable|string',
            'numero_registro' => 'nullable|string|max:100',
            'fecha_inspeccion' => 'nullable|date',
            'hora_inspeccion' => 'nullable|date_format:H:i:s',
            'comentario' => 'nullable|string',
            'objetivo' => 'nullable|string',
            'descripcion_causa' => 'nullable|string',
            'conclusiones_recomendaciones' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'errors' => $validator->errors(),
            ], 422);
        }

        $inspeccion->update($validator->validated());
        $inspeccion->load(['empresa', 'area']);

        return response()->json([
            'success' => true,
            'message' => 'Inspección actualizada exitosamente',
            'data' => $inspeccion,
        ]);
    }

    /**
     * Eliminar (soft delete) una inspección
     */
    public function destroy(Request $request, string $id)
    {
        $user = $request->user();
        
        $inspeccion = Inspeccion::find($id);

        if (!$inspeccion) {
            return response()->json([
                'success' => false,
                'message' => 'Inspección no encontrada',
            ], 404);
        }

        // Verificar que la inspección pertenezca al usuario
        if ($inspeccion->user_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'No tienes permiso para eliminar esta inspección',
            ], 403);
        }

        $inspeccion->delete();

        return response()->json([
            'success' => true,
            'message' => 'Inspección eliminada exitosamente',
        ]);
    }

    /**
     * Descargar plantilla Excel para una inspección (rellenada con datos)
     *
     * Posiciones del template (public/template_inspeccion.xlsx):
     *   B8       = N° Registro
     *   A12      = Razón social      D12 = RUC      F12 = Domicilio      I12 = Actividad económica
     *   A14      = Área              B14 = Zona      D14 = Fecha         G14 = Resp. Área   J14 = Resp. Inspección
     *   A17      = Hora              D17 = Planeada(X)  F17 = No Planeada(X)  I17 = Otro
     *   A19:K20  = Objetivo
     *   Row 22   = Headers resultados
     *   Row 23   = Primera fila de datos de resultados (insertar aquí)
     *   A25:K25  = Header "DESCRIPCIÓN DE LA CAUSA..."
     *   A26:K27  = Datos descripción causa
     *   A28:K28  = Header "CONCLUSIONES Y RECOMENDACIONES"
     *   A29:K30  = Datos conclusiones
     *   A31      = Header "ADJUNTAR:"
     *   A32:K32  = Datos adjuntar/comentario
     *   A33:K33  = Header "RESPONSABLE DEL REGISTRO"
     *   Row 34   = Nombre / Cargo / Fecha / Firma (fila existente para llenar)
     */
    public function downloadTemplate(Request $request, string $local_id)
    {
        try {
            $inspeccion = Inspeccion::with([
                'empresa',
                'area',
                'areas',
                'inspectores.cargo',
                'responsablesArea.personal',
                'responsablesArea.area',
                'resultados.responsable.cargo',
                'resultados.visores',
                'resultados.responsablesLevantamiento',
                'responsableRegistro.personal.cargo',
            ])->where('local_id', $local_id)->first();
            
            if (!$inspeccion) {
                return response()->json([
                    'success' => false,
                    'message' => 'Inspección no encontrada',
                ], 404);
            }

            \Log::info("downloadTemplate: local_id={$local_id}, id={$inspeccion->id}, resultados=" . $inspeccion->resultados->count() . ", inspectores=" . $inspeccion->inspectores->count());

            $templatePath = public_path('inspecciones_internas.xlsx');

            if (!File::exists($templatePath)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Plantilla no encontrada en el servidor',
                ], 404);
            }

            $filename = 'inspeccion_' . ($inspeccion->numero_registro ?? $inspeccion->id) . '.xlsx';

            $spreadsheet = IOFactory::load($templatePath);
            $sheet = $spreadsheet->getActiveSheet();

            // =====================================================
            // 1) ENCABEZADO - N° REGISTRO (B8)
            // =====================================================
            $sheet->setCellValue('B8', $inspeccion->numero_registro ?? '');

            // =====================================================
            // 2) DATOS DEL EMPLEADOR (fila 12)
            //    A=Razón Social, D=RUC, E=Domicilio, H=Actividad Económica
            // =====================================================
            $sheet->setCellValue('A12', $inspeccion->razon_social ?? optional($inspeccion->empresa)->razon_social ?? '');
            $sheet->setCellValue('D12', $inspeccion->ruc ?? optional($inspeccion->empresa)->ruc ?? '');
            $sheet->setCellValue('E12', $inspeccion->domicilio ?? optional($inspeccion->empresa)->domicilio ?? '');
            $sheet->setCellValue('H12', $inspeccion->actividad_economica ?? optional($inspeccion->empresa)->actividad_economica ?? '');

            // =====================================================
            // 3) DATOS DE LA INSPECCIÓN (fila 14)
            //    A=Área, D=Fecha, G=Resp. Área, J=Resp. Inspección
            // =====================================================
            $areasNames = $inspeccion->areas->pluck('name')->implode(', ');
            if (empty($areasNames) && $inspeccion->area) {
                $areasNames = $inspeccion->area->name;
            }
            $sheet->setCellValue('A14', $areasNames);

            if ($inspeccion->fecha_hora_inspeccion) {
                $sheet->setCellValue('D14', Carbon::parse($inspeccion->fecha_hora_inspeccion)->format('d/m/Y'));
            }

            // Responsables de área, se saca de los resultados.responsable, pero no se deben repetir los nombres de los responsables
            $respAreaNames = $inspeccion->resultados->map(function ($ra) {
                return optional($ra->responsable)->name ?? '';
            })->unique()->filter()->implode(', ');
            $sheet->setCellValue('G14', $respAreaNames);

            // Inspectores
            $inspectoresNames = $inspeccion->inspectores->map(function ($i) {
                return $i->name ?? trim("{$i->apellido_paterno} {$i->apellido_materno} {$i->nombres}");
            })->filter()->implode(', ');
            $sheet->setCellValue('J14', $inspectoresNames);

            // =====================================================
            // 4) HORA Y TIPO DE INSPECCIÓN (fila 17)
            // =====================================================
            if ($inspeccion->fecha_hora_inspeccion) {
                $sheet->setCellValue('A17', Carbon::parse($inspeccion->fecha_hora_inspeccion)->format('h:i A'));
            }

            if ($inspeccion->tipo_inspeccion == 'Otro') {
                $sheet->setCellValue('I17', $inspeccion->tipo_inspeccion_otro ?? '');
            } elseif ($inspeccion->tipo_inspeccion == 'Planeada') {
                $sheet->setCellValue('D17', 'X');
            } elseif ($inspeccion->tipo_inspeccion == 'No Planeada') {
                $sheet->setCellValue('F17', 'X');
            }

            // =====================================================
            // 5) TEXTOS DESCRIPTIVOS
            //    Se llenan ANTES de insertar filas de resultados
            //    porque insertNewRowBefore desplaza las celdas automáticamente.
            //    Nuevo formato: A19=Objetivo, A29=Descripción causa,
            //    A32=Conclusiones y recomendaciones
            // =====================================================
            $sheet->setCellValue('A19', $inspeccion->objetivo ?? '');
            $sheet->setCellValue('A29', $inspeccion->descripcion_causa ?? '');
            $sheet->setCellValue('A32', $inspeccion->conclusiones_recomendaciones ?? '');

            // =====================================================
            // 6) RESPONSABLE DEL REGISTRO (filas 37-39)
            //    El nuevo template tiene 3 filas pre-construidas:
            //    A="Nombre:" D="Cargo:" H="Fecha:" J="Firma:"
            //    Si hay más de 3 inspectores, se insertan filas adicionales.
            // =====================================================
            $inspectoresCollection = $inspeccion->inspectores;
            $firstRow = 37;
            $templateRows = 1; // filas pre-construidas: 37, 38, 39

            if ($inspectoresCollection->isNotEmpty()) {
                foreach ($inspectoresCollection as $idx => $inspector) {
                    $currentRow = $firstRow + $idx;

                    // Insertar fila nueva para inspectores que excedan las 3 filas del template
                    if ($idx >= $templateRows) {
                        $sheet->insertNewRowBefore($currentRow, 1);
                    }

                    $personalName = trim("{$inspector->apellido_paterno} {$inspector->apellido_materno}, {$inspector->nombres}");
                    $cargoName = ($inspector->cargo_name) ?? '';
                    $fechaFirma = $inspector->pivot->fecha_firma
                        ? Carbon::parse($inspector->pivot->fecha_firma)->format('d/m/Y')
                        : '';

                    $sheet->setCellValue("A{$currentRow}", "Nombre: {$personalName}");
                    $sheet->setCellValue("E{$currentRow}", "Cargo: {$cargoName}");
                    $sheet->setCellValue("H{$currentRow}", "Fecha: {$fechaFirma}");
                    $sheet->setCellValue("J{$currentRow}", 'Firma: ');
                    // agregar tamaño de fila para la firma digital
                    $sheet->getRowDimension($currentRow)->setRowHeight(51);
                    // hacer que la sección imprimible de la pagina sea hasta esta ultima firma
                    $sheet->getPageSetup()->setPrintArea("A1:K{$currentRow}");

                    // Firma digital (base64)
                    if ($inspector->pivot->firma_digital) {
                        try {
                            $firmaPath = $this->resolveImagePath($inspector->pivot->firma_digital);
                            if ($firmaPath && file_exists($firmaPath)) {
                                $drawing = new Drawing();
                                $drawing->setName('Firma Inspector ' . ($idx + 1));
                                $drawing->setDescription('Firma Inspector');
                                $drawing->setPath($firmaPath);
                                $drawing->setCoordinates("K{$currentRow}");
                                $drawing->setHeight(70);
                                $drawing->setWorksheet($sheet);
                            }
                        } catch (\Throwable $e) {
                            \Log::warning("Error al insertar firma inspector #{$inspector->id}: {$e->getMessage()}");
                        }
                    }
                }
            } else {
                // Fallback: usar responsable de registro si no hay inspectores
                $responsableRegistro = $inspeccion->responsableRegistro;
                if ($responsableRegistro) {
                    $personalName = optional($responsableRegistro->personal)->name ?? '';
                    $cargoName = optional(optional($responsableRegistro->personal)->cargo)->name ?? '';
                    $fechaFirma = $responsableRegistro->fecha_firma
                        ? Carbon::parse($responsableRegistro->fecha_firma)->format('d/m/Y')
                        : '';

                    $sheet->setCellValue('A37', "Nombre: {$personalName}");
                    $sheet->setCellValue('D37', "Cargo: {$cargoName}");
                    $sheet->setCellValue('H37', "Fecha: {$fechaFirma}");
                    $sheet->setCellValue('J37', 'Firma: ');

                    if ($responsableRegistro->firma_digital) {
                        try {
                            $firmaPath = $this->resolveImagePath($responsableRegistro->firma_digital);
                            if ($firmaPath && file_exists($firmaPath)) {
                                $drawing = new Drawing();
                                $drawing->setName('Firma');
                                $drawing->setDescription('Firma');
                                $drawing->setPath($firmaPath);
                                $drawing->setCoordinates('K37');
                                $drawing->setHeight(70);
                                $drawing->setWorksheet($sheet);
                            }
                        } catch (\Throwable $e) {
                            \Log::warning("Error al insertar firma: {$e->getMessage()}");
                        }
                    }
                }
            }

            // =====================================================
            // 7) RESULTADOS DE LA INSPECCIÓN (insertar desde fila 24)
            //    Fila 22 = headers. Filas 23-26 = filas vacías del template.
            //    Columnas del nuevo formato:
            //    A-B: Descripción | C: Foto inicial | D: Nivel riesgo
            //    E: Acción | F: Responsable | G: Cargo | H: Estado
            //    I: Fecha cierre | J: Foto final (levantamiento)
            // =====================================================
            $numResultados = $inspeccion->resultados->count();
            if ($numResultados > 0) {
                $row = 24;
                foreach ($inspeccion->resultados as $resultado) {
                    $sheet->insertNewRowBefore($row, 1);
                    $sheet->getRowDimension($row)->setRowHeight(150);

                    $sheet->setCellValue("A{$row}", $resultado->descripcion ?? '');
                    $sheet->mergeCells("A{$row}:B{$row}");
                    $sheet->mergeCells("C{$row}:D{$row}");
                    $sheet->setCellValue("E{$row}", $resultado->nivel_riesgo ?? '');
                    $sheet->setCellValue("F{$row}", $resultado->accion_tomar ?? '');
                    $sheet->setCellValue("G{$row}", optional($resultado->responsable)->name ?? '');
                    $sheet->setCellValue("H{$row}", optional(optional($resultado->responsable)->cargo)->name ?? '');
                    $sheet->setCellValue("I{$row}", $resultado->estado ?? '');
                    $sheet->setCellValue("J{$row}", $resultado->fecha_cierre
                        ? Carbon::parse($resultado->fecha_cierre)->format('d/m/Y')
                        : '');

                    // Foto inicial (registro fotográfico) → columna C
                    if ($resultado->registro_fotografico_inicial) {
                        try {
                            $fotoInicialPath = $this->resolveImagePath($resultado->registro_fotografico_inicial);
                            if ($fotoInicialPath && file_exists($fotoInicialPath)) {
                                $drawing = new Drawing();
                                $drawing->setName('Registro Inicial');
                                $drawing->setDescription('Foto inicial');
                                $drawing->setPath($fotoInicialPath);
                                $drawing->setCoordinates("C{$row}");
                                $drawing->setOffsetX(1);
                                $drawing->setOffsetY(1);
                                $drawing->setHeight(195);
                                $drawing->setWorksheet($sheet);
                            }
                        } catch (\Throwable $e) {
                            \Log::warning("Error foto inicial resultado #{$resultado->id}: {$e->getMessage()}");
                        }
                    }

                    // Foto final (levantamiento ejecutado) → columna J
                    if ($resultado->registro_fotografico_final) {
                        try {
                            $fotoFinalPath = $this->resolveImagePath($resultado->registro_fotografico_final);
                            if ($fotoFinalPath && file_exists($fotoFinalPath)) {
                                $drawing = new Drawing();
                                $drawing->setName('Levantamiento');
                                $drawing->setDescription('Levantamiento Ejecutado');
                                $drawing->setPath($fotoFinalPath);
                                $drawing->setCoordinates("K{$row}");
                                $drawing->setOffsetX(1);
                                $drawing->setOffsetY(1);
                                $drawing->setHeight(195);
                                $drawing->setWorksheet($sheet);
                            }
                        } catch (\Throwable $e) {
                            \Log::warning("Error foto final resultado #{$resultado->id}: {$e->getMessage()}");
                        }
                    }

                    $row++;
                }

                // Limpiar las 4 filas vacías originales del template (23-26)
                // Las filas 24, 25, 26 fueron empujadas a $row, $row+1, $row+2
                // La fila 23 sigue en su posición original
                for ($i = 3; $i >= 0; $i--) {
                    $sheet->removeRow($row + $i);
                }
                $sheet->removeRow(23);
            }

            // Guardar en un archivo temporal
            $tempFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . Str::random(12) . '.xlsx';
            $writer = new Xlsx($spreadsheet);
            $writer->save($tempFile);

            \Log::info("downloadTemplate: archivo generado exitosamente para {$inspeccion->local_id}");

            return response()->download($tempFile, $filename)->deleteFileAfterSend(true);
        } catch (\Throwable $e) {
            \Log::error('Error en downloadTemplate: ' . $e->getMessage() . ' | ' . $e->getTraceAsString());
            return response()->json([
                'success' => false,
                'message' => 'Error al generar/descargar la plantilla: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Resolver la ruta de una imagen para insertar en Excel.
     * 
     * Soporta:
     *  - Rutas relativas al disco 'public' de Laravel (ej: inspecciones/fotos_iniciales/inicial_abc.jpg)
     *    → guardadas por ImageHelper::processImage() via Storage::disk('public')->put()
     *  - Rutas con prefijo /storage/ (enlace simbólico público)
     *  - URLs remotas (http/https)
     *  - Strings base64 (data:image/...)
     *
     * @return string|null Ruta absoluta del archivo de imagen en disco, o null si no se pudo resolver.
     */
    private function resolveImagePath(string $imageValue): ?string
    {
        try {
            $imageValue = trim($imageValue);
            if (empty($imageValue)) {
                return null;
            }

            // ── 1) Ruta relativa al disco 'public' de Laravel ──
            // ImageHelper guarda con Storage::disk('public')->put('inspecciones/fotos_iniciales/...')
            // El archivo real queda en storage/app/public/inspecciones/...
            // Detectamos este caso cuando NO empieza con data:, http, ni /
            if (
                !str_starts_with($imageValue, 'data:') &&
                !str_starts_with($imageValue, 'http') &&
                !str_starts_with($imageValue, '/') &&
                preg_match('/\.(jpg|jpeg|png|gif|webp)$/i', $imageValue)
            ) {
                $diskPath = Storage::disk('public')->path($imageValue);
                if (file_exists($diskPath)) {
                    return $diskPath;
                }
                \Log::warning("resolveImagePath: ruta relativa no encontrada en disco público: {$imageValue} -> {$diskPath}");
                return null;
            }

            // ── 2) Ruta con prefijo /storage/ (symlink público) ──
            if (str_starts_with($imageValue, '/storage/') || str_starts_with($imageValue, 'storage/')) {
                // Intentar primero via public_path (symlink)
                $publicSymlink = public_path('/' . ltrim($imageValue, '/'));
                if (file_exists($publicSymlink)) {
                    return $publicSymlink;
                }

                // Fallback: extraer la parte relativa y buscar en disco 'public'
                $relative = preg_replace('#^/?storage/#', '', $imageValue);
                $diskPath = Storage::disk('public')->path($relative);
                if (file_exists($diskPath)) {
                    return $diskPath;
                }

                \Log::warning("resolveImagePath: ruta /storage/ no encontrada: {$imageValue}");
                return null;
            }

            // ── 3) URL remota (http/https) ──
            if (filter_var($imageValue, FILTER_VALIDATE_URL)) {
                $imageContents = @file_get_contents($imageValue);
                if ($imageContents === false) {
                    \Log::warning("resolveImagePath: no se pudo descargar URL: {$imageValue}");
                    return null;
                }

                $pathExt = pathinfo(parse_url($imageValue, PHP_URL_PATH), PATHINFO_EXTENSION);
                $extension = $pathExt ?: 'jpg';
                $filePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'img_' . uniqid() . '.' . $extension;
                file_put_contents($filePath, $imageContents);

                return file_exists($filePath) ? $filePath : null;
            }

            // ── 4) Base64 (data:image/...) ──
            if (str_starts_with($imageValue, 'data:image/')) {
                $parts = explode(',', $imageValue);
                if (count($parts) < 2) {
                    return null;
                }

                $extension = 'png';
                if (preg_match('/^data:image\/(\w+);/', $parts[0], $m)) {
                    $extension = strtolower($m[1]);
                    if ($extension === 'jpeg') $extension = 'jpg';
                }

                $decoded = base64_decode($parts[1]);
                if ($decoded === false) {
                    return null;
                }

                $filePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'img_' . uniqid() . '.' . $extension;
                file_put_contents($filePath, $decoded);

                return file_exists($filePath) ? $filePath : null;
            }

            // ── 5) Fallback: ruta absoluta directa ──
            if (file_exists($imageValue)) {
                return $imageValue;
            }

            \Log::warning("resolveImagePath: no se pudo resolver la imagen: " . Str::limit($imageValue, 100));
            return null;
        } catch (\Throwable $e) {
            \Log::warning("resolveImagePath: error al procesar imagen: {$e->getMessage()}");
            return null;
        }
    }
}
