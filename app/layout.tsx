import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TeamProvider } from '../lib/team-context';
import { CorsoProvider } from '../lib/corso-context';
import { NOME_PIATTAFORMA } from '../lib/brand';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="it">
      <body className={inter.className}>
        <CorsoProvider>
          <TeamProvider>{children}</TeamProvider>
        </CorsoProvider>
      </body>
    </html>
  );
}
