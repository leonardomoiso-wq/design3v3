import PaginaAteneo from '@/components/PaginaAteneo';

export default function AteneoPage({ params }: { params: { ateneo: string } }) {
  return <PaginaAteneo codice={decodeURIComponent(params.ateneo)} />;
}
