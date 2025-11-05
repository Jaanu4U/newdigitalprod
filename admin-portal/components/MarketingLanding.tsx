"use client";
import Link from "next/link";

export default function MarketingLanding() {
  return (
    <div className="min-h-screen bg-white">
      <header className="container mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded bg-brand-600" />
          <span className="text-xl font-semibold">Digitalchain</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-700">
          <a href="#features" className="hover:text-gray-900">Features</a>
          <a href="#how" className="hover:text-gray-900">How it works</a>
          <a href="#pricing" className="hover:text-gray-900">Pricing</a>
          <Link href="/signup" className="btn btn-primary">Get Started</Link>
        </nav>
      </header>

      <main>
        <section className="container mx-auto px-6 pt-10 pb-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">Unified logistics workflows for modern organizations</h1>
            <p className="mt-4 text-gray-600 text-lg">Digitalchain helps you assign deliveries, track progress, and manage teams in real-time—securely and at scale.</p>
            <div className="mt-6 flex gap-3">
              <Link href="/signup" className="btn btn-primary btn-lg">Create Organization</Link>
              <a href="#features" className="btn btn-secondary btn-lg">Learn more</a>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-video rounded-xl border shadow-sm bg-gradient-to-br from-brand-50 to-white" />
            <div className="absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-brand-100 blur-xl" />
          </div>
        </section>

        <section id="features" className="bg-gray-50 py-16">
          <div className="container mx-auto px-6 grid md:grid-cols-3 gap-6">
            {["Multi-tenant","Secure & Compliant","Real-time Tracking"].map((t,i)=> (
              <div key={i} className="p-6 bg-white rounded-lg border shadow-sm">
                <h3 className="font-semibold text-lg">{t}</h3>
                <p className="mt-2 text-gray-600">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio.</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="container mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold">How it works</h2>
          <ol className="mt-4 grid md:grid-cols-3 gap-6 text-gray-700">
            <li className="p-6 rounded-lg border bg-white"><strong>1.</strong> Create your organization</li>
            <li className="p-6 rounded-lg border bg-white"><strong>2.</strong> Invite your team</li>
            <li className="p-6 rounded-lg border bg-white"><strong>3.</strong> Assign and track deliveries</li>
          </ol>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-gray-600">© {new Date().getFullYear()} Digitalchain. All rights reserved.</footer>
    </div>
  )
}
