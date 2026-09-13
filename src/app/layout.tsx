import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Boma Yangu - Rental Management System',
  description: 'Modern rental management system for the Kenyan real estate market',
  keywords: ['rental management', 'property management', 'kenya', 'boma yangu', 'rent collection'],
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    title: 'Boma Yangu - Rental Management System',
    description: 'Modern rental management system for the Kenyan real estate market',
    type: 'website',
    siteName: 'Boma Yangu',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boma Yangu - Rental Management System',
    description: 'Modern rental management system for the Kenyan real estate market',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
