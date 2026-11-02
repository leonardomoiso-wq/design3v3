'use client';
import RichiedeCorso from '@/components/RichiedeCorso';
import ContestStudente from '@/components/moiso/ContestStudente';

// Contest di un corso (attività del corso scelto in home).
export default function ContestCorsoPage() {
  return <RichiedeCorso>{corso => <ContestStudente corso={corso} />}</RichiedeCorso>;
}
