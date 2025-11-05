import '../globals.css'

export const metadata = {
  title: 'SuperAdmin Login - Digitalchain',
  description: 'SuperAdmin platform login',
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
