import '../../contest.css';

export default function ContestDocenteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mz" style={{ height: '100%', overflowY: 'auto' }}>
      {children}
    </div>
  );
}
