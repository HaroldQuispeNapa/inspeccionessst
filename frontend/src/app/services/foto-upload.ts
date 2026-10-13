const MAX_DIMENSION = 2048;
const MAX_SIZE_WITHOUT_COMPRESSION = 512 * 1024;

/** Prepara la foto al guardar; la vista previa utiliza directamente el archivo original. */
export async function prepararFotoParaEnvio(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo leer la foto seleccionada.');
  const original = await response.blob();
  const imageUrl = URL.createObjectURL(original);
  try {
    const image = await cargarImagen(imageUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const formatoSoportado = /^image\/(jpeg|png|webp|gif)$/.test(original.type);
    let archivo = original;
    if (scale < 1 || original.size > MAX_SIZE_WITHOUT_COMPRESSION || !formatoSoportado) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la foto para guardarla.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const optimizada = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.')), 'image/jpeg', 0.85);
      });
      // Evitar aumentar el peso de archivos ya comprimidos.
      if (scale < 1 || optimizada.size < original.size || !formatoSoportado) archivo = optimizada;
      canvas.width = canvas.height = 0;
    }
    return await leerComoDataUrl(archivo);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo abrir la imagen. Selecciona otra foto.'));
    image.src = url;
  });
}

function leerComoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo preparar la foto para enviarla.'));
    reader.readAsDataURL(blob);
  });
}
