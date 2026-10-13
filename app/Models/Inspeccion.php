<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Inspeccion extends Model
{
    use HasFactory, SoftDeletes;

    public const CATEGORIAS = [
        'Inspecciones de maquinaria agrícola',
        'Inspección del CSST',
        'Inspección de actos y condiciones inseguras',
        'Inspección de luces de emergencia',
        'Inspección de duchas y lavaojos de emergencia',
        'Inspección de sistema de lucha contra incendios',
        'Inspección de manejo de agroquímicos',
        'Inspección de instalaciones eléctricas',
        'Inspección de uso de EPPs',
        'Inspección de buses de transporte de personal',
        'Inspección de equipos de altura (arnés, líneas de vida)',
        'Inspecciones internas de Seguridad y Salud en el Trabajo',
        // Compatibilidad con inspecciones guardadas antes de ampliar el catálogo.
        'Inspección eléctrica',
        'Inspección sanitaria',
    ];

    protected $table = 'inspecciones';

    protected $fillable = [
        'local_id',
        'user_id',
        'empresa_id',
        'area_id',
        'fundo_id',
        'tipo_inspeccion',
        'categoria',
        'placa',
        'tipo_inspeccion_otro',
        'vigencia_desde',
        'vigencia_hasta',
        'razon_social',
        'ruc',
        'domicilio',
        'actividad_economica',
        'zona_inspeccionada',
        'numero_registro',
        'fecha_hora_inspeccion',
        'comentario',
        'objetivo',
        'descripcion_causa',
        'conclusiones_recomendaciones',
        'synced',
        'synced_at',
    ];

    public function setPlacaAttribute(?string $value): void
    {
        $placa = mb_strtoupper(trim($value ?? ''));
        $this->attributes['placa'] = $placa === '' ? null : $placa;
    }

    protected $casts = [
        'user_id' => 'integer',
        'empresa_id' => 'integer',
        'area_id' => 'integer',
        'fundo_id' => 'integer',
        'vigencia_desde' => 'datetime',
        'vigencia_hasta' => 'datetime',
        'fecha_hora_inspeccion' => 'datetime',
        'synced' => 'boolean',
        'synced_at' => 'datetime',
    ];

    // Boot
    protected static function boot()
    {
        parent::boot();

        static::creating(function ($inspeccion) {
            if (empty($inspeccion->local_id)) {
                $inspeccion->local_id = (string) Str::uuid();
            }
        });
    }

    // Relaciones
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function empresa()
    {
        return $this->belongsTo(Empresa::class);
    }

    public function fundo()
    {
        return $this->belongsTo(\App\Models\Fundo::class);
    }

    public function area()
    {
        return $this->belongsTo(Area::class);
    }

    // Relaciones de tablas relacionadas (many-to-many y one-to-many)
    public function areas()
    {
        return $this->belongsToMany(Area::class, 'inspeccion_areas', 'inspeccion_id', 'area_id')
            ->wherePivotNull('deleted_at')
            ->withTimestamps();
    }

    public function inspectores()
    {
        return $this->belongsToMany(Personal::class, 'inspeccion_inspectores', 'inspeccion_id', 'personal_id')
            ->wherePivotNull('deleted_at')
            ->select(['personal.id', 'personal.nombres', 'personal.apellido_paterno', 'personal.apellido_materno', 'personal.dni', 'cargos.name as cargo_name'])
            ->join('cargos', 'personal.cargo_id', '=', 'cargos.id')
            ->withPivot('local_id', 'fecha_firma', 'firma_digital')
            ->withTimestamps();
    }

    public function responsablesArea()
    {
        return $this->hasMany(InspeccionResponsableArea::class);
    }

    public function resultados()
    {
        return $this->hasMany(ResultadoInspeccion::class);
    }

    public function responsableRegistro()
    {
        return $this->hasOne(ResponsableRegistro::class);
    }

    // Scopes
    public function scopeSincronizado($query)
    {
        return $query->where('synced', true);
    }

    public function scopePendienteSincronizacion($query)
    {
        return $query->where('synced', false);
    }

    public function scopePorUsuario($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopePorUsuarioOInspector($query, $userId, $personalId = null)
    {
        return $query->where(function ($q) use ($userId, $personalId) {
            // 1. Inspecciones creadas por el usuario
            $q->where('user_id', $userId);
            
            if ($personalId) {
                // 2. Inspecciones donde es inspector
                $q->orWhereHas('inspectores', function ($subQ) use ($personalId) {
                    $subQ->where('personal.id', $personalId);
                });
                
                // 3. Inspecciones donde es responsable de algún resultado
                $q->orWhereHas('resultados', function ($subQ) use ($personalId) {
                    $subQ->where('responsable_id', $personalId);
                });
                
                // 4. Inspecciones donde es visor de algún resultado
                $q->orWhereHas('resultados.visores', function ($subQ) use ($personalId) {
                    $subQ->where('personal.id', $personalId);
                });
                
                // 5. Inspecciones donde es responsable de levantamiento de algún resultado
                $q->orWhereHas('resultados.responsablesLevantamiento', function ($subQ) use ($personalId) {
                    $subQ->where('personal.id', $personalId);
                });
            }
        });
    }

    public function scopePorEmpresa($query, $empresaId)
    {
        return $query->where('empresa_id', $empresaId);
    }

    public function scopePorArea($query, $areaId)
    {
        return $query->where('area_id', $areaId);
    }

    public function scopePorFecha($query, $fechaInicio, $fechaFin = null)
    {
        if ($fechaFin) {
            return $query->whereBetween('fecha_hora_inspeccion', [$fechaInicio, $fechaFin]);
        }
        return $query->whereDate('fecha_hora_inspeccion', $fechaInicio);
    }

    public function scopeConRelaciones($query)
    {
        return $query->with([
            'user:id,name,email',
            'empresa:id,name,razon_social,ruc',
            'fundo:id,nombre',
            'area:id,name,empresa_id',
            'areas:id,name',
            'inspectores:id,nombres,apellido_paterno,apellido_materno,cargo_id',
            'responsablesArea.personal:id,nombres,apellido_paterno,apellido_materno',
            'responsablesArea.area:id,name',
            'resultados.responsables.personal:id,nombres,apellido_paterno,apellido_materno',
            'resultados.responsable:id,nombres,apellido_paterno,apellido_materno,cargo_id',
            'resultados.comentarios.user:id,name',
            'resultados.visores:id,nombres,apellido_paterno,apellido_materno,cargo_id',
            'resultados.responsablesLevantamiento:id,nombres,apellido_paterno,apellido_materno,cargo_id',
            'resultados.fotoFinalAprobador:id,nombres,apellido_paterno,apellido_materno,cargo_id',
            'resultados.fotoInicialAprobador:id,nombres,apellido_paterno,apellido_materno,cargo_id',
            'responsableRegistro.personal:id,nombres,apellido_paterno,apellido_materno,cargo_id'
        ]);
    }
}
