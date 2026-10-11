import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'TermsGuard — Commercial assurance', description: 'Frozen commercial terms, independently verified evidence.' }
import { Providers } from './providers'
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Providers>{children}</Providers></body></html> }
