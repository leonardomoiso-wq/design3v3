'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QR({ testo, scuro = '#1c1917', chiaro = '#ffffff', dimensione = 180 }: { testo: string; scuro?: string; chiaro?: string; dimensione?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(testo, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: scuro, light: chiaro } })
      .then(setSvg).catch(() => setSvg(''));
  }, [testo, scuro, chiaro]);
  return (
    <div
      role="img"
      aria-label={`QR code per ${testo}`}
      style={{ width: dimensione, height: dimensione, borderRadius: 10, overflow: 'hidden', background: chiaro }}
      dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${dimensione}" height="${dimensione}"`) }}
    />
  );
}
