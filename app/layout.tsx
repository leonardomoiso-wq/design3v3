import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { TeamProvider } from '../lib/team-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Design 3 · Piattaforma Casi Studio',
  description: 'Piattaforma per la sottomissione, la revisione e l\'analisi multicriterio dei casi studio del Laboratorio di Design 3.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TeamProvider>{children}</TeamProvider>
      </body>
    </html>
  );
}
