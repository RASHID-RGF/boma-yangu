'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Shield,
  Wallet,
  BarChart3,
  ArrowRight,
  CheckCircle,
  Users,
  Home,
  ChevronRight,
  Sparkles,
  Zap,
  Star,
  Clock,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { SettingsProvider } from '@/lib/settings/context';
import { SettingsToggleButton, SettingsPanel } from '@/components/settings/settings-panel';

function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${Math.random() * 3 + 1}px`,
            height: `${Math.random() * 3 + 1}px`,
            background: 'rgba(226, 183, 20, 0.15)',
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${Math.random() * 6 + 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  );
}

function TypewriterText() {
  const phrases = ['M-Pesa Payments', 'Property Tracking', 'Tenant Management', '24/7 Support'];
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(
      () => {
        const fullText = phrases[currentPhrase];
        if (!isDeleting) {
          if (displayText.length < fullText.length) {
            setDisplayText(fullText.slice(0, displayText.length + 1));
          } else {
            setTimeout(() => setIsDeleting(true), 2000);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText(displayText.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentPhrase((prev) => (prev + 1) % phrases.length);
          }
        }
      },
      isDeleting ? 40 : 80
    );
    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentPhrase, phrases]);

  return (
    <span className="text-[#e2b714]">
      {displayText}
      <span className="animate-blink text-[#e2b714] font-light">|</span>
    </span>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <div
      className="card-monkey rounded-2xl p-6 md:p-8 group"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="w-12 h-12 rounded-xl bg-[#e2b714]/10 flex items-center justify-center mb-5 group-hover:bg-[#e2b714]/20 transition-all duration-300 group-hover:scale-110">
        <Icon className="w-6 h-6 text-[#e2b714]" />
      </div>
      <h3 className="text-lg font-semibold text-[#d4d4d4] mb-3 group-hover:text-[#e2b714] transition-colors duration-300">
        {title}
      </h3>
      <p className="text-[#646669] leading-relaxed text-sm">
        {description}
      </p>
      <div className="mt-4 flex items-center gap-1 text-[#e2b714]/0 group-hover:text-[#e2b714]/60 text-xs font-medium transition-all duration-300">
        Learn more <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl md:text-4xl font-bold text-[#e2b714] mb-1 font-mono">
        {value}
      </div>
      <div className="text-[#646669] text-sm">{label}</div>
    </div>
  );
}

export default function LandingPage() {
  const [isVisible, setIsVisible] = useState({
    hero: false,
    features: false,
    stats: false,
    cta: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible((prev) => ({ ...prev, hero: true }));
    }, 100);
    const featureTimer = setTimeout(() => {
      setIsVisible((prev) => ({ ...prev, features: true }));
    }, 300);
    const statsTimer = setTimeout(() => {
      setIsVisible((prev) => ({ ...prev, stats: true }));
    }, 500);
    const ctaTimer = setTimeout(() => {
      setIsVisible((prev) => ({ ...prev, cta: true }));
    }, 700);

    return () => {
      clearTimeout(timer);
      clearTimeout(featureTimer);
      clearTimeout(statsTimer);
      clearTimeout(ctaTimer);
    };
  }, []);

  const features = [
    {
      icon: Wallet,
      title: 'M-Pesa Integration',
      description: 'Collect rent seamlessly via M-Pesa STK Push, Paybill, and Till Number with automatic receipt generation and real-time confirmation.',
    },
    {
      icon: Building2,
      title: 'Property Portfolio',
      description: 'Manage multiple properties and units with ease. Track occupancy rates, lease expirations, and property performance in real-time.',
    },
    {
      icon: Users,
      title: 'Tenant Hub',
      description: 'Centralized tenant profiles with lease agreements, payment history, documents, and communication logs all in one place.',
    },
    {
      icon: Shield,
      title: 'Maintenance Tracker',
      description: 'Tenants can report issues with photos. Track repair progress, assign vendors, and keep everyone updated automatically.',
    },
    {
      icon: BarChart3,
      title: 'Analytics Dashboard',
      description: 'Beautiful, real-time dashboard with income reports, occupancy trends, vacancy tracking, and actionable financial insights.',
    },
    {
      icon: Sparkles,
      title: 'Smart Automation',
      description: 'Auto-generate invoices, send rent reminders via SMS/email, and automate late fee calculations based on your rules.',
    },
  ];

  return (
    <SettingsProvider>
    <div className="min-h-screen bg-[var(--settings-bg,#0f0f1a)] overflow-hidden noise-overlay" data-settings-root>
      {/* Grid Background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(226, 183, 20, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(226, 183, 20, 0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Glow effects */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#e2b714]/[0.03] rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#e2b714]/[0.02] rounded-full blur-[100px] pointer-events-none" />

      <FloatingParticles />

      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-700 ${
          isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#e2b714]/10 flex items-center justify-center border border-[#e2b714]/20 group-hover:bg-[#e2b714]/20 transition-all duration-300">
                <Home className="w-5 h-5 text-[#e2b714]" />
              </div>
              <span className="font-bold text-lg md:text-xl text-[#d4d4d4]">
                Boma<span className="text-[#e2b714]">Yangu</span>
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button
                  variant="ghost"
                  className="text-[#646669] hover:text-[#d4d4d4] hover:bg-white/[0.06] transition-all duration-200"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <button className="btn-gold rounded-lg px-5 py-2.5 text-sm flex items-center gap-2">
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 md:pt-40 pb-20 md:pb-32 px-4">
        <div
          className={`max-w-5xl mx-auto text-center transition-all duration-1000 ${
            isVisible.hero ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
            <Zap className="w-3 h-3" />
            Trusted by Kenyan Landlords
          </div>

          {/* Main Heading - Horizontal */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.2] mb-6 tracking-tight flex items-center justify-center gap-4 flex-wrap">
            <span className="text-[#d4d4d4]">Rent</span>
            <span className="text-[#585858] text-2xl md:text-3xl lg:text-4xl font-light">/</span>
            <span className="gradient-gold">Manage</span>
            <span className="text-[#585858] text-2xl md:text-3xl lg:text-4xl font-light">/</span>
            <span className="text-[#d4d4d4]">Grow</span>
          </h1>

          {/* Typewriter Subtitle */}
          <p className="text-lg md:text-xl text-[#646669] max-w-2xl mx-auto mb-4 font-mono">
            <span className="text-[#646669]">$ </span>
            <TypewriterText />
          </p>

          <p className="text-base md:text-lg text-[#646669] max-w-2xl mx-auto mb-10">
            The all-in-one rental management platform designed for the Kenyan market.
            Collect rent via M-Pesa, track maintenance, and grow your portfolio.
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/register">
              <button className="btn-gold rounded-xl px-8 py-4 text-base md:text-lg flex items-center gap-2">
                Start Free Trial <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
            <Link href="#features">
              <button className="btn-gold-outline rounded-xl px-8 py-4 text-base md:text-lg">
                Learn More
              </button>
            </Link>
          </div>

          {/* Floating stats hint */}
          <div className="mt-16 flex items-center justify-center gap-8 md:gap-12 animate-fade-in">
            {[
              { icon: CheckCircle, text: 'No Credit Card Required' },
              { icon: Zap, text: 'Free 14-Day Trial' },
              { icon: Clock, text: 'Instant Setup' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-[#646669] text-xs md:text-sm">
                <item.icon className="w-4 h-4 text-[#e2b714]/60" />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section
        className={`py-16 md:py-20 px-4 transition-all duration-1000 ${
          isVisible.stats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="max-w-5xl mx-auto">
          <div className="glass-dark rounded-2xl p-8 md:p-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <StatCard value="500+" label="Properties Managed" />
              <StatCard value="2.5K+" label="Happy Tenants" />
              <StatCard value="98%" label="Payment Rate" />
              <StatCard value="24/7" label="Support Available" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 md:py-24 px-4 relative">
        <div
          className={`max-w-7xl mx-auto transition-all duration-1000 ${
            isVisible.features ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
              <Star className="w-3 h-3" />
              Powerful Features
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-[#d4d4d4] mb-4">
              Everything You Need
            </h2>
            <p className="text-[#646669] text-lg max-w-xl mx-auto">
              Powerful tools designed for the Kenyan rental market
            </p>
            <div className="mt-4 w-16 h-0.5 bg-[#e2b714]/30 mx-auto rounded-full" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {features.map((feature, i) => (
              <FeatureCard key={i} {...feature} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        className={`py-16 md:py-24 px-4 transition-all duration-1000 ${
          isVisible.cta ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl border border-[#e2b714]/10">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#0f0f1a] to-[#1a1a2e]" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#e2b714]/[0.04] rounded-full blur-[80px]" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#e2b714]/[0.03] rounded-full blur-[80px]" />

            <div className="relative px-8 py-16 md:px-16 md:py-20 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
                <Sparkles className="w-3 h-3" />
                Get Started Today
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-[#d4d4d4] mb-4">
                Ready to Simplify
                <span className="text-[#e2b714]"> Rental Management</span>?
              </h2>
              <p className="text-[#646669] text-lg max-w-2xl mx-auto mb-10">
                Join hundreds of Kenyan landlords who trust Boma Yangu to manage their properties.
                Start your free trial today — no credit card required.
              </p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <Link href="/register">
                  <button className="btn-gold rounded-xl px-8 py-4 text-base md:text-lg flex items-center gap-2">
                    Get Started Free <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>
                <Link href="/login">
                  <button className="btn-gold-outline rounded-xl px-8 py-4 text-base md:text-lg">
                    Sign In
                  </button>
                </Link>
              </div>
              <div className="mt-8 flex items-center justify-center gap-6 text-[#585858] text-xs">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[#e2b714]/40" /> Free 14-day trial
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[#e2b714]/40" /> No credit card
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-[#e2b714]/40" /> Cancel anytime
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-[#e2b714]/[0.06]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Home className="w-4 h-4 text-[#e2b714]" />
              <span className="text-sm text-[#646669]">
                &copy; 2024 <span className="text-[#d4d4d4]">Boma Yangu</span>. All rights reserved.
              </span>
            </div>
            <div className="flex items-center gap-6">
              {['Privacy', 'Terms', 'Contact', 'FAQ'].map((item) => (
                <a
                  key={item}
                  href="#"
                  className="text-xs text-[#585858] hover:text-[#d4d4d4] transition-colors duration-200"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
          <div className="mt-6 text-center text-xs text-[#333]">
            Built with{' '}
            <span className="text-[#e2b714]/40">✦</span>{' '}
            for the Kenyan rental market
          </div>
        </div>
      </footer>

      {/* Settings */}
      <SettingsToggleButton />
      <SettingsPanel />
    </div>
    </SettingsProvider>
  );
}
