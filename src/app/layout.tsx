import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "FotoFacil",
  description: "Subidas diarias por tienda y control admin.",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#007f8f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="font-[var(--font-sans)]">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
