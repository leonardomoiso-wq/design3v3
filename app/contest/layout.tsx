import '../contest.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contest',
  description: 'Le proposte in gara e il voto anonimo, da remoto e dal vivo.',
};

export default function ContestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mz" style={{ minHeight: '100vh' }}>
      {children}
    </div>
  );
}
