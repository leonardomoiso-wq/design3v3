import './globals.css';
import './contest.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TeamProvider } from '../lib/team-context';
import { CorsoProvider } from '../lib/corso-context';
import { NOME_PIATTAFORMA } from '../lib/brand';

// Le pagine HTML non si tengono in cache (né nel browser né nei CDN):
// così dopo ogni pubblicazione si carica subito la versione nuova, con il
// CSS giusto. CSS e JS restano in cache: hanno l'impronta nel nome.
export const dynamic = 'force-dynamic';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: NOME_PIATTAFORMA,
  description: 'Piattaforma per la design education: casi studio, valutazione multicriterio, peer review e attività di laboratorio, con uno spazio separato per ogni corso.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className={inter.variable}>
      <body className={inter.className}>
        <CorsoProvider>
          <TeamProvider>{children}</TeamProvider>
        </CorsoProvider>
      </body>
    </html>
  );
}
