import '../moiso.css';
import type { Metadata } from 'next';
import { FontMoiso } from '@/components/moiso/Moiso';

export const metadata: Metadata = {
  title: 'Contest · Design 3',
  description: 'Le proposte in gara e il voto anonimo, da remoto e dal vivo.',
};

export default function ContestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mz" style={{ minHeight: '100vh' }}>
      <FontMoiso />
      {children}
    </div>
  );
}
