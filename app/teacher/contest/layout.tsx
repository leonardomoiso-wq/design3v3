import '../../moiso.css';
import { FontMoiso } from '@/components/moiso/Moiso';

export default function ContestDocenteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mz" style={{ height: '100%', overflowY: 'auto' }}>
      <FontMoiso />
      {children}
    </div>
  );
}
