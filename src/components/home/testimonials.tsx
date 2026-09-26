'use client';

import { BadgeCheck, Quote, Star } from 'lucide-react';
import { Reveal } from './reveal';

interface Testimonial {
  name: string;
  role: string;
  quote: string;
  rating: number;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'John Kamau',
    role: 'Landlord · 12 units, Nairobi',
    quote:
      'Rent lands in my account and the receipt is generated before I even open the app. I stopped chasing tenants in December and arrears fell to almost nothing.',
    rating: 5,
  },
  {
    name: 'Mary Nyambura',
    role: 'Tenant · Kilimani',
    quote:
      'The M-Pesa prompt goes straight to my phone, I enter my PIN and I am done. My lease, receipts and messages all live in one place.',
    rating: 5,
  },
  {
    name: 'Peter Ochieng',
    role: 'Caretaker · Green Heights',
    quote:
      'Tenants report issues with photos, I get assigned the job and everyone sees the progress. Nothing falls through the cracks anymore.',
    rating: 5,
  },
  {
    name: 'Faith Chebet',
    role: 'Landlord · 4 units, Nakuru',
    quote:
      'I can see occupancy, arrears and expenses per property at a glance. My accountant now asks me for the report instead of the other way round.',
    rating: 5,
  },
  {
    name: 'Samuel Mwangi',
    role: 'Property Manager · Mombasa',
    quote:
      'Invoices generate themselves every month and the reminders go out on their own. Managing eight buildings from my phone finally feels possible.',
    rating: 5,
  },
  {
    name: 'Grace Achieng',
    role: 'Tenant · Westlands',
    quote:
      'When the taps leaked I sent one message with a photo. I got updates the whole way through and the job was closed the same week.',
    rating: 4,
  },
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
}

export function Testimonials() {
  return (
    <section id="testimonials" className="py-16 md:py-24 px-4 relative">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
              <BadgeCheck className="w-3 h-3" />
              Testimonials
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-[#d4d4d4] mb-4">
              What People Say
            </h2>
            <p className="text-[#646669] text-lg max-w-xl mx-auto">
              Landlords, caretakers and tenants using Boma Yangu every day
            </p>
            <div className="mt-4 w-16 h-0.5 bg-[#e2b714]/30 mx-auto rounded-full" />
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={(i % 3) * 90}>
              <figure className="card-monkey rounded-2xl p-6 h-full flex flex-col hover:-translate-y-1 transition-transform duration-300">
                <Quote className="w-6 h-6 text-[#e2b714]/30 mb-4" />
                <blockquote className="text-sm leading-relaxed text-[#a0a0a0] flex-1">
                  “{t.quote}”
                </blockquote>
                <div className="mt-5 pt-5 border-t border-[#e2b714]/10 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e2b714] to-[#c9a010] text-[#0f0f1a] text-sm font-bold flex items-center justify-center shrink-0">
                    {initials(t.name)}
                  </span>
                  <div className="min-w-0">
                    <figcaption className="text-sm font-semibold text-[#d4d4d4] truncate">
                      {t.name}
                    </figcaption>
                    <p className="text-[11px] text-[#585858] truncate">{t.role}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-0.5 shrink-0">
                    {Array.from({ length: 5 }).map((_, star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star < t.rating ? 'text-[#e2b714] fill-current' : 'text-[#333]'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
