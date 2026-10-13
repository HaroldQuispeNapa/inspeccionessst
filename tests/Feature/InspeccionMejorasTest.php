<?php

namespace Tests\Feature;

use App\Models\Inspeccion;
use App\Models\ResultadoInspeccion;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InspeccionMejorasTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Estas pruebas utilizan exclusivamente una base efímera, sin migrar la base configurada en .env.
        config(['app.url' => 'http://localhost', 'database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        $this->app['url']->forceRootUrl('http://localhost');
        DB::purge('sqlite');
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('password');
            $table->unsignedBigInteger('personal_id')->nullable();
            $table->timestamps();
        });
        Schema::create('personal', function (Blueprint $table) {
            $table->id();
            $table->string('nombres')->nullable();
            $table->softDeletes();
        });
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
        });
        Schema::create('user_role', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('role_id');
        });
        foreach (['empresas', 'areas'] as $catalogo) {
            Schema::create($catalogo, function (Blueprint $table) {
                $table->id();
                $table->softDeletes();
            });
            DB::table($catalogo)->insert(['id' => 1]);
        }
        foreach (['inspecciones' => new Inspeccion(), 'resultados_inspeccion' => new ResultadoInspeccion()] as $nombre => $model) {
            Schema::create($nombre, function (Blueprint $table) use ($model) {
                $table->id();
                foreach ($model->getFillable() as $campo) {
                    if (!in_array($campo, ['categoria', 'placa'], true)) $table->text($campo)->nullable();
                }
                $table->timestamps();
                $table->softDeletes();
            });
        }
        Schema::create('resultado_responsables_levantamiento', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('resultado_id');
            $table->unsignedBigInteger('personal_id');
            $table->string('local_id')->nullable();
            $table->timestamps();
        });
        (require database_path('migrations/2026_10_13_000001_add_categoria_and_resultado_comentarios.php'))->up();
        (require database_path('migrations/2026_10_13_000002_add_placa_to_inspecciones.php'))->up();
    }

    private function usuario(?int $personalId = 10): User
    {
        return User::forceCreate(['name' => 'Usuario de prueba', 'email' => 'prueba@example.test', 'password' => 'testing', 'personal_id' => $personalId]);
    }

    private function resultado(?int $responsableId = 10): ResultadoInspeccion
    {
        $inspeccion = Inspeccion::create(['user_id' => 1, 'empresa_id' => 1, 'tipo_inspeccion' => 'Planeada']);
        return ResultadoInspeccion::create(['inspeccion_id' => $inspeccion->id, 'responsable_id' => $responsableId,
            'descripcion' => 'Hallazgo de prueba', 'estado' => 'Pendiente', 'nivel_riesgo' => 'Medio']);
    }

    public function test_responsable_registra_comentarios_con_autor_y_sin_sobrescribir_el_anterior(): void
    {
        $user = $this->usuario();
        Sanctum::actingAs($user);
        $resultado = $this->resultado();
        $this->postJson("/api/v1/resultados/{$resultado->id}/comentarios", ['contenido' => '  EPP solicitado.  ', 'user_id' => 999])
            ->assertCreated()->assertJsonPath('data.contenido', 'EPP solicitado.')->assertJsonPath('data.user.id', $user->id);
        $this->postJson("/api/v1/resultados/{$resultado->id}/comentarios", ['contenido' => 'EPP entregado.'])->assertCreated();
        $this->assertSame(2, $resultado->comentarios()->count());
        $this->assertSame('Pendiente', $resultado->fresh()->estado);
    }

    public function test_operario_asignado_al_levantamiento_puede_comentar(): void
    {
        Sanctum::actingAs($this->usuario(20));
        $resultado = $this->resultado();
        DB::table('personal')->insert(['id' => 20]);
        DB::table('resultado_responsables_levantamiento')->insert(['resultado_id' => $resultado->id, 'personal_id' => 20]);
        $this->postJson("/api/v1/resultados/{$resultado->id}/comentarios", ['contenido' => 'Trabajo realizado.'])->assertCreated();
    }

    public function test_un_usuario_no_asignado_no_puede_comentar(): void
    {
        Sanctum::actingAs($this->usuario(99));
        $resultado = $this->resultado();
        $this->postJson("/api/v1/resultados/{$resultado->id}/comentarios", ['contenido' => 'Sin permiso'])->assertForbidden();
        $this->assertSame(0, $resultado->comentarios()->count());
    }

    public function test_un_usuario_sin_personal_no_coincide_con_un_resultado_sin_responsable(): void
    {
        Sanctum::actingAs($this->usuario(null));
        $resultado = $this->resultado(null);
        $this->postJson("/api/v1/resultados/{$resultado->id}/comentarios", ['contenido' => 'Sin permiso'])->assertForbidden();
    }

    public function test_comentarios_requieren_texto_y_respetan_el_limite(): void
    {
        Sanctum::actingAs($this->usuario());
        $resultado = $this->resultado();
        foreach (['   ', str_repeat('a', 2001)] as $contenido) {
            $this->postJson("/api/v1/resultados/{$resultado->id}/comentarios", compact('contenido'))
                ->assertUnprocessable()->assertJsonValidationErrors('contenido');
        }
    }

    public function test_categoria_se_guarda_y_los_valores_no_permitidos_se_rechazan(): void
    {
        Sanctum::actingAs($this->usuario());
        foreach (['Inspección eléctrica', 'Inspección sanitaria'] as $categoria) {
            $this->postJson('/api/v1/inspecciones', ['empresa_id' => 1, 'area_id' => 1, 'tipo_inspeccion' => 'Planeada', 'categoria' => $categoria])
                ->assertCreated()->assertJsonPath('data.categoria', $categoria);
        }
        $this->postJson('/api/v1/inspecciones', ['empresa_id' => 1, 'area_id' => 1, 'tipo_inspeccion' => 'Planeada', 'categoria' => 'Otra'])
            ->assertUnprocessable();
    }

    public function test_la_placa_es_opcional_se_normaliza_y_puede_quitarse_al_editar(): void
    {
        Sanctum::actingAs($this->usuario());
        $datos = ['empresa_id' => 1, 'area_id' => 1, 'tipo_inspeccion' => 'Planeada'];
        $this->postJson('/api/v1/inspecciones', $datos)->assertCreated()->assertJsonPath('data.placa', null);
        $response = $this->postJson('/api/v1/inspecciones', [...$datos, 'placa' => '  abc-123  '])
            ->assertCreated()->assertJsonPath('data.placa', 'ABC-123');
        $id = $response->json('data.id');
        $this->putJson("/api/v1/inspecciones/{$id}", ['comentario' => 'Conservar placa'])
            ->assertOk()->assertJsonPath('data.placa', 'ABC-123');
        $this->putJson("/api/v1/inspecciones/{$id}", ['placa' => 'xyz-987'])
            ->assertOk()->assertJsonPath('data.placa', 'XYZ-987');
        $this->putJson("/api/v1/inspecciones/{$id}", ['placa' => ''])
            ->assertOk()->assertJsonPath('data.placa', null);
        $this->assertNull(Inspeccion::findOrFail($id)->placa);
    }

    public function test_la_placa_se_sincroniza_se_conserva_en_clientes_antiguos_y_se_puede_borrar(): void
    {
        Sanctum::actingAs($this->usuario());
        $datos = ['local_id' => (string) \Illuminate\Support\Str::uuid(), 'tipo_inspeccion' => 'Planeada',
            'placa' => 'abc-123', 'numero_registro' => 'QA-PLACA', 'fecha_hora_inspeccion' => '2026-10-13T08:00:00'];
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $inspeccion = Inspeccion::where('local_id', $datos['local_id'])->firstOrFail();
        $this->assertSame('ABC-123', $inspeccion->placa);
        unset($datos['placa']);
        $datos['updated_at'] = now()->addMinute()->toIso8601String();
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $this->assertSame('ABC-123', $inspeccion->fresh()->placa);
        $datos['placa'] = 'xyz-987';
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $this->assertSame('XYZ-987', $inspeccion->fresh()->placa);
        $datos['placa'] = null;
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $this->assertNull($inspeccion->fresh()->placa);
    }

    public function test_la_placa_respeta_su_limite_en_creacion_edicion_y_sincronizacion(): void
    {
        Sanctum::actingAs($this->usuario());
        $inspeccion = Inspeccion::create(['user_id' => 1, 'tipo_inspeccion' => 'Planeada', 'placa' => 'ABC-123']);
        foreach ([str_repeat('A', 21), ['ABC-123']] as $placa) {
            $this->postJson('/api/v1/inspecciones', ['empresa_id' => 1, 'area_id' => 1,
                'tipo_inspeccion' => 'Planeada', 'placa' => $placa])
                ->assertUnprocessable()->assertJsonValidationErrors('placa');
            $this->putJson("/api/v1/inspecciones/{$inspeccion->id}", compact('placa'))
                ->assertUnprocessable()->assertJsonValidationErrors('placa');
            $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [[
                'local_id' => (string) \Illuminate\Support\Str::uuid(), 'tipo_inspeccion' => 'Planeada',
                'placa' => $placa, 'numero_registro' => 'QA-INVALIDA', 'fecha_hora_inspeccion' => '2026-10-13T08:00:00',
            ]]])->assertUnprocessable()->assertJsonValidationErrors('inspecciones.0.placa');
        }
        $this->assertSame('ABC-123', $inspeccion->fresh()->placa);
    }

    public function test_el_responsable_principal_puede_guardar_la_foto_final(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->usuario());
        $resultado = $this->resultado();
        $foto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
        $this->postJson("/api/v1/resultados/{$resultado->id}/foto-final", compact('foto'))
            ->assertOk()->assertJsonPath('data.foto_final_estado', 'pendiente');
        Storage::disk('public')->assertExists($resultado->fresh()->registro_fotografico_final);
        $this->assertStringEndsWith('.png', $resultado->fresh()->registro_fotografico_final);
    }

    public function test_la_categoria_se_conserva_al_sincronizar_desde_el_formulario_offline(): void
    {
        Sanctum::actingAs($this->usuario());
        $datos = ['local_id' => (string) \Illuminate\Support\Str::uuid(), 'tipo_inspeccion' => 'Planeada',
            'categoria' => 'Inspección sanitaria', 'numero_registro' => 'QA-1', 'fecha_hora_inspeccion' => '2026-10-13T08:00:00'];
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $this->assertSame('Inspección sanitaria', Inspeccion::where('local_id', $datos['local_id'])->firstOrFail()->categoria);
        // Una versión antigua del cliente puede enviar el registro sin el nuevo campo.
        unset($datos['categoria']);
        $datos['updated_at'] = now()->addMinute()->toIso8601String();
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $this->assertSame('Inspección sanitaria', Inspeccion::where('local_id', $datos['local_id'])->firstOrFail()->categoria);
    }

    public function test_categoria_actual_del_formulario_se_sincroniza_sin_error_422(): void
    {
        Sanctum::actingAs($this->usuario());
        $datos = ['local_id' => (string) \Illuminate\Support\Str::uuid(), 'tipo_inspeccion' => 'Planeada',
            'categoria' => 'Inspecciones de maquinaria agrícola', 'numero_registro' => 'QA-CATEGORIA',
            'fecha_hora_inspeccion' => '2026-10-13T08:00:00'];
        $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertOk()->assertJsonPath('summary.sincronizados', 1);
        $this->assertSame($datos['categoria'], Inspeccion::where('local_id', $datos['local_id'])->firstOrFail()->categoria);
    }

    public function test_las_categorias_del_formulario_se_aceptan_en_creacion_edicion_y_sincronizacion(): void
    {
        Sanctum::actingAs($this->usuario());
        // Proteger el contrato entre el catálogo que ve el usuario y las validaciones del servidor.
        $formulario = file_get_contents(base_path('frontend/src/app/pages/inspecciones/inspeccion-form/inspeccion-form.page.ts'));
        $this->assertSame(1, preg_match('/categoriasInspeccion:\s*CategoriaInspeccion\[\]\s*=\s*\[(.*?)\];/s', $formulario, $lista));
        preg_match_all("/'([^']+)'/u", $lista[1], $opciones);
        $this->assertNotEmpty($opciones[1]);
        foreach ($opciones[1] as $categoria) {
            $response = $this->postJson('/api/v1/inspecciones', [
                'empresa_id' => 1, 'area_id' => 1, 'tipo_inspeccion' => 'Planeada', 'categoria' => $categoria,
            ])->assertCreated()->assertJsonPath('data.categoria', $categoria);
            $id = $response->json('data.id');
            $this->putJson("/api/v1/inspecciones/{$id}", ['categoria' => $categoria])
                ->assertOk()->assertJsonPath('data.categoria', $categoria);
            $datos = ['local_id' => (string) \Illuminate\Support\Str::uuid(), 'tipo_inspeccion' => 'Planeada',
                'categoria' => $categoria, 'numero_registro' => 'QA-CATEGORIA', 'fecha_hora_inspeccion' => '2026-10-13T08:00:00'];
            $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
                ->assertOk()->assertJsonPath('summary.sincronizados', 1);
            $this->assertSame($categoria, Inspeccion::where('local_id', $datos['local_id'])->firstOrFail()->categoria);
        }
    }

    public function test_la_sincronizacion_rechaza_categorias_ajenas_al_catalogo_con_un_motivo_claro(): void
    {
        Sanctum::actingAs($this->usuario());
        $datos = ['local_id' => (string) \Illuminate\Support\Str::uuid(), 'tipo_inspeccion' => 'Planeada',
            'categoria' => 'No existe', 'numero_registro' => 'QA-INVALIDA', 'fecha_hora_inspeccion' => '2026-10-13T08:00:00'];
        $response = $this->postJson('/api/v1/sync/inspecciones', ['inspecciones' => [$datos]])
            ->assertUnprocessable()->assertJsonValidationErrors('inspecciones.0.categoria');
        $this->assertStringContainsString('categoría seleccionada', $response->json('errors')['inspecciones.0.categoria'][0]);
        $this->assertSame(0, Inspeccion::count());
    }
}
