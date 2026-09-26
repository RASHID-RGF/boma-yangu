'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, Clock, PenLine } from 'lucide-react';
import { Reveal } from './reveal';

interface Post {
  title: string;
  excerpt: string;
  category: string;
  date: string;
  readTime: string;
  image: string;
}

const POSTS: Post[] = [
  {
    title: '5 rent-collection habits that keep arrears near zero',
    excerpt:
      'The small routines top-performing Kenyan landlords share: clear due dates, automatic reminders, receipts on payment and an escalation path that never gets personal.',
    category: 'Guides',
    date: '12 Sep 2024',
    readTime: '6 min read',
    image: '/boma.jpeg',
  },
  {
    title: 'STK Push vs Paybill: choosing your M-Pesa collection channel',
    excerpt:
      'Both collect rent, but they behave differently for your tenants and your reconciliation. Here is how to pick — and how to run both at once.',
    category: 'Payments',
    date: '4 Sep 2024',
    readTime: '8 min read',
    image: '/smart%20automation%20.jpeg',
  },
  {
    title: 'A maintenance workflow your tenants will actually use',
    excerpt:
      'Photos at intake, one assignee, visible status. A simple loop that cuts repair costs and stops the same complaint coming back three times.',
    category: 'Operations',
    date: '28 Aug 2024',
    readTime: '5 min read',
    image: '/maintenace%20tracker.jpeg',
  },
];

export function BlogSection() {
  return (
    <section id="blog" className="py-16 md:py-24 px-4 relative">
      <div className="max-w-7xl mx-auto">
        <Reveal>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-6 border border-[#e2b714]/20 bg-[#e2b714]/5 text-[#e2b714]">
              <PenLine className="w-3 h-3" />
              From the Blog
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-[#d4d4d4] mb-4">
              Ideas for Smarter Landlording
            </h2>
            <p className="text-[#646669] text-lg max-w-xl mx-auto">
              Practical playbooks on rent, repairs and growing your portfolio
            </p>
            <div className="mt-4 w-16 h-0.5 bg-[#e2b714]/30 mx-auto rounded-full" />
          </div>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {POSTS.map((post, i) => (
            <Reveal key={post.title} delay={i * 100}>
              <article className="card-monkey rounded-2xl overflow-hidden h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300">
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f1a] via-[#0f0f1a]/20 to-transparent" />
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#e2b714] text-[#0f0f1a]">
                    {post.category}
                  </span>
                </div>

                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-4 text-[11px] text-[#585858] mb-3">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="w-3 h-3" /> {post.date}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> {post.readTime}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-[#d4d4d4] mb-2 group-hover:text-[#e2b714] transition-colors duration-300">
                    {post.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#646669] flex-1">
                    {post.excerpt}
                  </p>

                  <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#e2b714]/70 group-hover:text-[#e2b714] transition-colors">
                    Read article <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <div className="mt-10 text-center">
            <Link
              href="#blog"
              className="btn-gold-outline rounded-xl px-6 py-3 text-sm inline-flex items-center gap-2"
            >
              View all articles <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
