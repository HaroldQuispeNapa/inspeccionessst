import { prepararFotoParaEnvio } from './foto-upload';

describe('Preparación de fotos para subir', () => {
  const urls: string[] = [];

  afterEach(() => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.length = 0;
  });

  async function foto(width: number, height: number): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#365769');
    gradient.addColorStop(1, '#eaf7f8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
  }

  function url(blob: Blob): string {
    const result = URL.createObjectURL(blob);
    urls.push(result);
    return result;
  }

  async function dimensiones(dataUrl: string): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  it('reduce una foto grande conservando sus proporciones y produciendo un JPEG más ligero', async () => {
    const original = await foto(4096, 2048);
    const result = await prepararFotoParaEnvio(url(original));
    expect(result.startsWith('data:image/jpeg;base64,')).toBeTrue();
    expect(await dimensiones(result)).toEqual([2048, 1024]);
    const optimizada = await (await fetch(result)).blob();
    expect(optimizada.size).toBeLessThan(original.size);
  });

  it('mantiene una imagen pequeña en su formato original y no aumenta su resolución', async () => {
    const original = await foto(120, 60);
    const result = await prepararFotoParaEnvio(url(original));
    expect(result.startsWith('data:image/png;base64,')).toBeTrue();
    expect(await dimensiones(result)).toEqual([120, 60]);
    expect((await (await fetch(result)).blob()).size).toBe(original.size);
  });

  it('rechaza archivos que no son imágenes', async () => {
    await expectAsync(prepararFotoParaEnvio(url(new Blob(['contenido inválido'], { type: 'text/plain' }))))
      .toBeRejectedWithError('No se pudo abrir la imagen. Selecciona otra foto.');
  });

  it('normaliza archivos de cámara que no informan su tipo de imagen', async () => {
    const original = await foto(120, 60);
    const result = await prepararFotoParaEnvio(url(new Blob([original], { type: 'application/octet-stream' })));
    expect(result.startsWith('data:image/jpeg;base64,')).toBeTrue();
    expect(await dimensiones(result)).toEqual([120, 60]);
  });
});
