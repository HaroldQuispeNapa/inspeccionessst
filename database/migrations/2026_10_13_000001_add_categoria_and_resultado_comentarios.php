<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inspecciones', function (Blueprint $table) {
            $table->string('categoria', 80)->nullable();
        });

        Schema::create('resultado_comentarios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('resultado_id')->constrained('resultados_inspeccion')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users');
            $table->text('contenido');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('resultado_comentarios');
        Schema::table('inspecciones', function (Blueprint $table) {
            $table->dropColumn('categoria');
        });
    }
};
