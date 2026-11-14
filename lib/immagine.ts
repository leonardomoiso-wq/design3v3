// Le immagini (sketch, generazioni AI, copertine dei casi) vengono salvate
// come data URL direttamente nelle righe del DB: senza un ridimensionamento
// lato client, una foto scattata da telefono (spesso 3-10 MB) appesantisce
// ogni fetch delle gallerie che le mostrano tutte insieme. Ridimensioniamo e
// ricomprimiamo qui, prima dell'upload, così che ogni immagine resti
// comoda da caricare e scorrere senza perdere leggibilità nelle gallerie
// e nella lightbox.
const DIMENSIONE_MASSIMA_PX = 1600;
const QUALITA_JPEG = 0.82;

export function comprimiImmagine(file: File, dimensioneMassima = DIMENSIONE_MASSIMA_PX, qualita = QUALITA_JPEG): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('immagine_non_valida'));
      img.onload = () => {
        let { width, height } = img;
        if (width > dimensioneMassima || height > dimensioneMassima) {
          if (width >= height) {
            height = Math.round((height * dimensioneMassima) / width);
            width = dimensioneMassima;
          } else {
            width = Math.round((width * dimensioneMassima) / height);
            height = dimensioneMassima;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        // sfondo bianco: alcuni sketch sono PNG con trasparenza, che in JPEG
        // diventerebbe nero senza questo riempimento preventivo.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          resolve(canvas.toDataURL('image/jpeg', qualita));
        } catch {
          resolve(reader.result as string);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
