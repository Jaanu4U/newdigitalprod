import './globals.css'

export const metadata = {
  title: 'Digitalchain Admin Portal',
  description: 'Digitalchain platform administration',
}

import ClientLayout from './ClientLayout'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}
