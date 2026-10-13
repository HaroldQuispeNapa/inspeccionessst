<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ResultadoComentario extends Model
{
    protected $table = 'resultado_comentarios';

    protected $fillable = ['user_id', 'contenido'];

    public function resultado()
    {
        return $this->belongsTo(ResultadoInspeccion::class, 'resultado_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
