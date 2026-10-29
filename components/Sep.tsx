// Separatore tra informazioni affiancate (gruppo, anno, provenienza...):
// solo spazio, niente puntini. Chi usa un lettore di schermo sente una
// virgola.
export default function Sep() {
  return <span className="sep" aria-hidden="false"><span className="sr-only">, </span></span>;
}
