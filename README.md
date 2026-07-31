# Boma Yangu - Rental Management System

Boma Yangu (Swahili for "My Home") is a modern, secure, and responsive rental management system designed specifically for the Kenyan real estate market.

## 🏗️ Tech Stack

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS, Radix UI Primitives
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT (jose) + bcrypt
- **Payments:** M-Pesa Daraja API Integration
- **Charts:** Chart.js + react-chartjs-2
- **Forms:** React Hook Form + Zod Validation

## ✨ Features

### Core Modules
- **User Management** - Role-based access (Super Admin, Landlord, Manager, Caretaker, Tenant)
- **Property Management** - Add, edit, categorize properties with Google Maps integration
- **Unit Management** - Individual units with rent, deposit, utility tracking
- **Tenant Management** - Profiles, IDs, lease agreements, history
- **Rent Collection** - M-Pesa STK Push, Bank Transfer, Cash recording
- **Invoicing** - Auto-generated monthly invoices with PDF download
- **Maintenance Requests** - Track repairs from report to resolution
- **Notifications** - SMS, Email, WhatsApp reminders
- **Reports & Analytics** - Dashboard with charts, trends, forecasting
- **Financial Management** - Income, expenses, P&L tracking
- **Lease Management** - Digital agreements, renewal reminders
- **Document Storage** - Secure file storage for all documents

### Kenyan Market Specifics
- M-Pesa Daraja API Integration
- KRA PIN support
- National ID validation
- Multi-language (English & Kiswahili)
- Mobile-first responsive design

### Security
- HTTPS enforced
- JWT authentication
- Role-based permissions
- Encrypted passwords (bcrypt)
- Audit logs
- Rate limiting
- Input validation (Zod)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/boma-yangu.git
cd boma-yangu
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

4. Set up the database
```bash
npm run db:migrate
npm run db:seed
```

5. Start the development server
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Authentication pages
│   ├── dashboard/         # Main dashboard
│   ├── properties/        # Property management
│   ├── tenants/           # Tenant management
│   ├── payments/          # Payment & invoicing
│   ├── maintenance/       # Maintenance requests
│   ├── leases/            # Lease management
│   ├── reports/           # Reports & analytics
│   ├── documents/         # Document storage
│   ├── portal/            # Tenant & Caretaker portals
│   └── admin/             # Admin panel
├── components/            # Reusable components
│   ├── ui/               # UI primitives
│   ├── layout/           # Layout components
│   └── forms/            # Form components
├── lib/                   # Utilities & libraries
│   ├── auth/             # Authentication logic
│   ├── db/               # Database utilities
│   ├── payments/         # Payment processing
│   └── utils/            # Helper functions
├── types/                 # TypeScript types
├── hooks/                 # Custom React hooks
└── store/                 # Zustand stores
```

## 🧪 Available Scripts

- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run lint` - Lint code
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema to database
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data
- `npm run db:studio` - Open Prisma Studio

## 📄 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

## 📞 Support

For support, email support@bomayangu.com or visit our help center.
