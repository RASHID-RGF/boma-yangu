'use client';

import { CheckCircle, Layers } from 'lucide-react';
import { Reveal } from './reveal';

interface ShowcaseRow {
  badge: string;
  title: string;
  body: string;
  bullets: string[];
  image: string;
  chip: string;
  reverse: boolean;
}

const ROWS: ShowcaseRow[] = [
  {
    badge: 'Live Insights',
    title: 'Know your numbers in real time',
    body: 'Open the dashboard and see exactly where the portfolio stands — collected rent, arrears, occupancy and expenses, updated the moment money moves.',
    bullets: [
      'Income vs expenses, month by month',
      'Occupancy and vacancy trends per property',
      'Outstanding balances ranked by how old they are',
    ],
    image: '/analytics%20dashboard.jpeg',
    chip: '98% payment rate',
    reverse: false,
  },
  {
    badge: 'Portfolio View',
    title: 'Every property, one place',
    body: 'From a bedsitter in Eastleigh to a four-bedroom in Mombasa — units, leases, deposits and documents sit under one roof with caretakers assigned to what they manage.',
    bullets: [
      'Units, leases and deposits tracked per property',
      'Caretaker assignments with scoped access',
      'A document vault for leases, receipts and IDs',
    ],
    image: '/property%20portfolio.jpeg',
    chip: '500+ properties',
    reverse: true,
  },
  {
    badge: 'Self-Service',
    title: 'Tenants who help themselves',
    body: 'Tenants pay, report, download and message without calling you — and every action lands in your feed with a timestamp and a receipt attached.',
    bullets: [
      'Pay rent and download receipts instantly',
      'Maintenance requests with photos and live status',
      'Messages and notifications in a single thread',
    ],
    image: '/TENANT%20hub.jpeg',
    chip: '2.5K+ happy tenants',
    reverse: false,
  },
];

export function FeatureShowcase() {
  return (
    <section id="showcase" className="py-16 md:py-24 px-4 relative">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
              <Layers className="w-3 h-3" />
              More Features
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-[#d4d4d4] mb-4">
              Built for the way you actually work
            </h2>
            <p className="text-[#646669] text-lg max-w-xl mx-auto">
              A closer look at the parts of Boma Yangu landlords open every day
            </p>
            <div className="mt-4 w-16 h-0.5 bg-[#e2b714]/30 mx-auto rounded-full" />
          </div>
        </Reveal>

        <div className="space-y-16 md:space-y-24">
          {ROWS.map((row, i) => (
            <div
              key={row.title}
              className={`grid md:grid-cols-2 gap-8 md:gap-12 items-center ${
                row.reverse ? 'md:[&>*:first-child]:order-2' : ''
              }`}
            >
              <Reveal>
                <div className="relative">
                  <div className="absolute -inset-3 bg-[#e2b714]/[0.06] blur-2xl rounded-3xl" />
                  <div className="relative rounded-2xl overflow-hidden border border-[#e2b714]/15 group">
                    <img
                      src={row.image}
                      alt={row.title}
                      className="w-full h-56 md:h-80 object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a]/70 via-transparent to-transparent" />
                    <span className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#0f0f1a]/85 border border-[#e2b714]/30 text-[#e2b714] backdrop-blur">
                      {row.chip}
                    </span>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={120}>
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium mb-5 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
                    {row.badge}
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-[#d4d4d4] mb-4">
                    {row.title}
                  </h3>
                  <p className="text-[#646669] leading-relaxed mb-6">{row.body}</p>
                  <ul className="space-y-3">
                    {row.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-sm text-[#a0a0a0]">
                        <CheckCircle className="w-4 h-4 text-[#e2b714] mt-0.5 shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
