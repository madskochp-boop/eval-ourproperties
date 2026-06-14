import type { Metadata } from "next";
import { Playfair_Display, Spectral, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});
const spectral = Spectral({
  variable: "--font-spectral",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Evaluering · Our Properties",
  description:
    "Få en uafhængig vurdering af en ejendomsinvestering. Upload salgsopstilling, vælg strategi, modtag HTML-rapport, Excel-cashflow og investor-deck.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="da">
      <body
        className={`${playfair.variable} ${spectral.variable} ${inter.variable} ${jetbrains.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
