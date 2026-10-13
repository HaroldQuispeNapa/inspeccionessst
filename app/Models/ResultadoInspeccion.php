<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class ResultadoInspeccion extends Model
{
    use HasFactory, SoftDeletes;

    protected $table = 'resultados_inspeccion';

    protected $fillable = [
        'local_id',
        'inspeccion_id',
        'responsable_id',
        'descripcion',
        'registro_fotografico_inicial',
        'foto_inicial_estado',
        'foto_inicial_comentario',
        'foto_inicial_aprobador_id',
        'foto_inicial_aprobada_at',
        'nivel_riesgo',
        'accion_tomar',
        'estado',
        'fecha_cierre',
        'registro_fotografico_final',
        'foto_final_estado',
        'foto_final_comentario',
        'foto_final_aprobador_id',
        'foto_final_aprobada_at',
        'synced',
        'synced_at',
    ];

    protected $casts = [
        'inspeccion_id' => 'integer',
        'fecha_cierre' => 'date',
        'foto_inicial_aprobada_at' => 'datetime',
        'foto_final_aprobada_at' => 'datetime',
        'synced' => 'boolean',
        'synced_at' => 'datetime',
    ];

    // Boot
    protected static function boot()
    {
        parent::boot();

        static::creating(function ($resultado) {
            if (empty($resultado->local_id)) {
                $resultado->local_id = (string) Str::uuid();
            }
        });
    }

    // Relationships
    public function inspeccion()
    {
        return $this->belongsTo(Inspeccion::class);
    }

    public function responsable()
    {
        return $this->belongsTo(Personal::class, 'responsable_id');
    }

    public function comentarios()
    {
        return $this->hasMany(ResultadoComentario::class, 'resultado_id')->orderBy('id');
    }

    public function visores()
    {
        return $this->belongsToMany(Personal::class, 'resultado_visores', 'resultado_id', 'personal_id')
            ->withTimestamps()
            ->withPivot('local_id');
    }

    public function responsablesLevantamiento()
    {
        return $this->belongsToMany(Personal::class, 'resultado_responsables_levantamiento', 'resultado_id', 'personal_id')
            ->withTimestamps()
            ->withPivot('local_id');
    }

    public function fotoInicialAprobador()
    {
        return $this->belongsTo(Personal::class, 'foto_inicial_aprobador_id');
    }

    public function fotoFinalAprobador()
    {
        return $this->belongsTo(Personal::class, 'foto_final_aprobador_id');
    }

    public function responsables()
    {
        return $this->hasMany(ResultadoResponsable::class, 'resultado_id');
    }

    // Scopes
    public function scopePendienteSincronizacion($query)
    {
        return $query->where('synced', false);
    }

    public function scopePorEstado($query, $estado)
    {
        return $query->where('estado', $estado);
    }

    public function scopePorNivelRiesgo($query, $nivel)
    {
        return $query->where('nivel_riesgo', $nivel);
    }
}
