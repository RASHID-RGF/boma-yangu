import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Boma Yangu - Rental Management System',
  description: 'Modern rental management system for the Kenyan real estate market',
  keywords: ['rental management', 'property management', 'kenya', 'boma yangu', 'rent collection'],
  openGraph: {
    title: 'Boma Yangu - Rental Management System',
    description: 'Modern rental management system for the Kenyan real estate market',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
