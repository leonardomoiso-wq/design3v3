import IngressoCorso from '@/components/IngressoCorso';

export default function CorsoPage({ params }: { params: { ateneo: string; corso: string } }) {
  return <IngressoCorso ateneo={decodeURIComponent(params.ateneo)} codice={decodeURIComponent(params.corso)} />;
}
