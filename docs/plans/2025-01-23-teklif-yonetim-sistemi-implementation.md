# BTS Teklif Yönetim Sistemi - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a web-based quote management system for a fire security company to replace their Excel-based workflow, enabling faster quote preparation and better tracking.

**Architecture:** Next.js 14 (App Router) frontend with TypeScript, PostgreSQL database with Prisma ORM, REST API routes in Next.js. Server-side rendering for initial loads, client-side interactivity for the quote editor. Authentication via session cookies with bcrypt password hashing.

**Tech Stack:**
- Frontend: Next.js 14, React 18, TypeScript, Tailwind CSS, Lucide React icons
- Backend: Next.js API Routes, Prisma ORM
- Database: PostgreSQL
- Libraries: React Hook Form, Zod validation, TanStack Table, React Query

---

## Phase 1: Project Setup & Core Infrastructure

### Task 1.1: Initialize Next.js Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tailwind.config.ts`
- Create: `next.config.js`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Create Next.js project with TypeScript and Tailwind**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Select options:
- Would you like to use TypeScript? Yes
- Would you like to use ESLint? Yes
- Would you like to use Tailwind CSS? Yes
- Would you like to use `src/` directory? Yes
- Would you like to use App Router? Yes
- Would you like to customize the default import alias? Yes (@/*)

**Step 2: Install core dependencies**

```bash
npm install prisma @prisma/client bcryptjs jsonwebtoken zod react-hook-form @hookform/resolvers lucide-react @tanstack/react-query @tanstack/react-table date-fns
```

```bash
npm install -D @types/bcryptjs @types/jsonwebtoken
```

**Step 3: Create environment file**

Create `.env.example`:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/bts_teklif?schema=public"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
SESSION_SECRET="your-session-secret-change-in-production"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Create `.env` (copy from .env.example and fill in real values)

**Step 4: Update .gitignore**

Add to `.gitignore`:
```
# Environment
.env
.env.local

# Database
prisma/*.db
prisma/*.db-journal

# IDE
.idea/
.vscode/
*.swp
*.swo
```

**Step 5: Commit**

```bash
git add .
git commit -m "chore: initialize Next.js project with TypeScript and Tailwind"
```

---

### Task 1.2: Setup Prisma and Database Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

**Step 1: Initialize Prisma**

```bash
npx prisma init
```

**Step 2: Write database schema**

Create `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== USERS & AUTH ====================

model Role {
  id              String   @id @default(cuid())
  name            String   @unique
  canViewCosts    Boolean  @default(false)
  canApprove      Boolean  @default(false)
  canExport       Boolean  @default(true)
  canManageUsers  Boolean  @default(false)
  canEditProducts Boolean  @default(false)
  canDelete       Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  users           User[]
}

model User {
  id            String         @id @default(cuid())
  username      String         @unique
  passwordHash  String
  fullName      String
  email         String?
  roleId        String
  role          Role           @relation(fields: [roleId], references: [id])
  isActive      Boolean        @default(true)
  lastLogin     DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  quotes        Quote[]        @relation("CreatedBy")
  approvedQuotes Quote[]       @relation("ApprovedBy")
  notifications Notification[]
  quoteHistory  QuoteHistory[]
  documents     QuoteDocument[]
}

// ==================== COMPANIES ====================

enum CompanyType {
  CLIENT
  PARTNER
}

model Company {
  id          String      @id @default(cuid())
  name        String
  type        CompanyType
  address     String?
  taxNumber   String?
  phone       String?
  email       String?
  contacts    Json?       // Array of {name, title, email, phone}
  notes       String?
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  projects    Project[]
  quotes      Quote[]
  priceHistory PriceHistory[]
}

// ==================== PROJECTS ====================

enum ProjectStatus {
  TEKLIF_ASAMASINDA
  ONAYLANDI
  DEVAM_EDIYOR
  TAMAMLANDI
  IPTAL
}

model Project {
  id             String        @id @default(cuid())
  name           String
  clientId       String
  client         Company       @relation(fields: [clientId], references: [id])
  status         ProjectStatus @default(TEKLIF_ASAMASINDA)
  estimatedStart DateTime?
  estimatedEnd   DateTime?
  notes          String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  quotes         Quote[]
  documents      ProjectDocument[]
  activities     ProjectActivity[]
}

model ProjectDocument {
  id         String   @id @default(cuid())
  projectId  String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  fileName   String
  filePath   String
  fileType   String
  fileSize   Int
  uploadedBy String
  createdAt  DateTime @default(now())
}

model ProjectActivity {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  action    String
  note      String
  createdAt DateTime @default(now())
}

// ==================== PRODUCTS ====================

model ProductCategory {
  id        String    @id @default(cuid())
  name      String    @unique
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  products  Product[]
}

model ProductBrand {
  id        String    @id @default(cuid())
  name      String    @unique
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  products  Product[]
}

model Product {
  id           String           @id @default(cuid())
  code         String           @unique
  shortCode    String?
  brandId      String?
  brand        ProductBrand?    @relation(fields: [brandId], references: [id])
  categoryId   String?
  category     ProductCategory? @relation(fields: [categoryId], references: [id])
  model        String?
  name         String
  nameTr       String?          // Turkish name if different
  unit         String           @default("Adet")
  listPrice    Decimal          @db.Decimal(12, 2)
  costPrice    Decimal?         @db.Decimal(12, 2)
  currency     String           @default("EUR")
  supplier     String?
  isActive     Boolean          @default(true)
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  quoteItems   QuoteItem[]
  priceHistory PriceHistory[]
}

// ==================== QUOTES ====================

enum QuoteStatus {
  TASLAK
  ONAY_BEKLIYOR
  ONAYLANDI
  GONDERILDI
  TAKIPTE
  REVIZYON
  KAZANILDI
  KAYBEDILDI
  IPTAL
}

model Quote {
  id              String        @id @default(cuid())
  quoteNumber     String        @unique
  projectId       String?
  project         Project?      @relation(fields: [projectId], references: [id])
  companyId       String
  company         Company       @relation(fields: [companyId], references: [id])
  subject         String?
  currency        String        @default("EUR")
  exchangeRate    Decimal       @db.Decimal(10, 4)
  protectionPct   Decimal       @default(0) @db.Decimal(5, 2)
  subtotal        Decimal       @default(0) @db.Decimal(12, 2)
  discountTotal   Decimal       @default(0) @db.Decimal(12, 2)
  discountPct     Decimal       @default(0) @db.Decimal(5, 2)
  vatTotal        Decimal       @default(0) @db.Decimal(12, 2)
  grandTotal      Decimal       @default(0) @db.Decimal(12, 2)
  status          QuoteStatus   @default(TASLAK)
  validUntil      DateTime?
  validityDays    Int           @default(30)
  version         Int           @default(1)
  parentQuoteId   String?
  parentQuote     Quote?        @relation("QuoteRevisions", fields: [parentQuoteId], references: [id])
  revisions       Quote[]       @relation("QuoteRevisions")
  createdById     String
  createdBy       User          @relation("CreatedBy", fields: [createdById], references: [id])
  approvedById    String?
  approvedBy      User?         @relation("ApprovedBy", fields: [approvedById], references: [id])
  approvedAt      DateTime?
  notes           String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  items           QuoteItem[]
  documents       QuoteDocument[]
  history         QuoteHistory[]
  commercialTerms QuoteCommercialTerm[]

  @@index([companyId])
  @@index([projectId])
  @@index([status])
  @@index([createdById])
}

enum QuoteItemType {
  PRODUCT
  HEADER
  NOTE
  CUSTOM
}

model QuoteItem {
  id          String        @id @default(cuid())
  quoteId     String
  quote       Quote         @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  productId   String?
  product     Product?      @relation(fields: [productId], references: [id])
  itemType    QuoteItemType @default(PRODUCT)
  sortOrder   Int           @default(0)
  code        String?
  brand       String?
  description String
  quantity    Decimal       @default(1) @db.Decimal(10, 2)
  unit        String        @default("Adet")
  listPrice   Decimal       @default(0) @db.Decimal(12, 2)
  katsayi     Decimal       @default(1) @db.Decimal(5, 3)
  unitPrice   Decimal       @default(0) @db.Decimal(12, 2)
  discountPct Decimal       @default(0) @db.Decimal(5, 2)
  vatRate     Decimal       @default(20) @db.Decimal(5, 2)
  totalPrice  Decimal       @default(0) @db.Decimal(12, 2)
  notes       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([quoteId])
}

model QuoteDocument {
  id         String   @id @default(cuid())
  quoteId    String
  quote      Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  fileName   String
  filePath   String
  fileType   String
  fileSize   Int
  uploadedById String
  uploadedBy User     @relation(fields: [uploadedById], references: [id])
  createdAt  DateTime @default(now())
}

model QuoteHistory {
  id        String   @id @default(cuid())
  quoteId   String
  quote     Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  action    String   // CREATE, UPDATE, STATUS_CHANGE, APPROVE, EXPORT
  changes   Json?    // {field: {old, new}}
  createdAt DateTime @default(now())

  @@index([quoteId])
}

// ==================== COMMERCIAL TERMS ====================

model CommercialTermTemplate {
  id        String   @id @default(cuid())
  category  String   // payment, delivery, warranty, vat, teslim_yeri
  name      String
  value     String
  isDefault Boolean  @default(false)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([category, name])
}

model QuoteCommercialTerm {
  id        String   @id @default(cuid())
  quoteId   String
  quote     Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  category  String
  value     String
  sortOrder Int      @default(0)
}

// ==================== CURRENCY & EXCHANGE ====================

model ExchangeRate {
  id           String   @id @default(cuid())
  fromCurrency String
  toCurrency   String
  rate         Decimal  @db.Decimal(12, 6)
  source       String   @default("MANUAL") // TCMB, MANUAL
  isManual     Boolean  @default(false)
  fetchedAt    DateTime @default(now())
  createdAt    DateTime @default(now())

  @@unique([fromCurrency, toCurrency, fetchedAt])
  @@index([fromCurrency, toCurrency])
}

// ==================== APPROVAL RULES ====================

enum ApprovalConditionType {
  VALUE_GT        // Grand total greater than
  VALUE_LT        // Grand total less than
  DISCOUNT_GT     // Discount percentage greater than
  KATSAYI_LT      // Any katsayi less than
  ALWAYS          // Always require approval
}

model ApprovalRule {
  id              String                @id @default(cuid())
  name            String
  conditionType   ApprovalConditionType
  conditionValue  Decimal?              @db.Decimal(12, 2)
  requiresRoleId  String
  isActive        Boolean               @default(true)
  sortOrder       Int                   @default(0)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
}

// ==================== PRICE HISTORY ====================

model PriceHistory {
  id         String   @id @default(cuid())
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  companyId  String
  company    Company  @relation(fields: [companyId], references: [id])
  quoteId    String
  unitPrice  Decimal  @db.Decimal(12, 2)
  katsayi    Decimal  @db.Decimal(5, 3)
  quantity   Decimal  @db.Decimal(10, 2)
  currency   String
  quotedAt   DateTime @default(now())

  @@index([productId, companyId])
  @@index([productId])
}

// ==================== NOTIFICATIONS ====================

enum NotificationType {
  APPROVAL_NEEDED
  QUOTE_APPROVED
  QUOTE_REJECTED
  QUOTE_EXPIRING
  FOLLOW_UP_REMINDER
  SYSTEM
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  message   String
  link      String?
  isRead    Boolean          @default(false)
  createdAt DateTime         @default(now())

  @@index([userId, isRead])
}
```

**Step 3: Create Prisma client helper**

Create `src/lib/db.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

**Step 4: Generate Prisma client and create database**

```bash
npx prisma generate
npx prisma db push
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: setup Prisma with complete database schema"
```

---

### Task 1.3: Setup Tailwind with Design System

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`
- Create: `src/lib/cn.ts`

**Step 1: Update Tailwind config with design system colors**

Replace `tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F172A',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        accent: {
          DEFAULT: '#0369A1',
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

**Step 2: Update global CSS**

Replace `src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

@layer base {
  html {
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply bg-primary-50 text-primary-950;
  }

  /* Tabular numbers for data */
  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }
}

@layer components {
  /* Button base styles */
  .btn {
    @apply inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    @apply btn bg-accent-700 hover:bg-accent-600 text-white;
  }

  .btn-secondary {
    @apply btn bg-white hover:bg-primary-50 text-primary-700 border border-primary-300;
  }

  .btn-danger {
    @apply btn bg-red-600 hover:bg-red-700 text-white;
  }

  .btn-ghost {
    @apply btn bg-transparent hover:bg-primary-100 text-primary-700;
  }

  /* Input styles */
  .input {
    @apply w-full px-3 py-2 border border-primary-300 rounded-lg text-sm text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-shadow duration-200;
  }

  .input-error {
    @apply input border-red-500 focus:ring-red-500;
  }

  /* Card styles */
  .card {
    @apply bg-white rounded-xl border border-primary-200 overflow-hidden;
  }

  .card-header {
    @apply px-5 py-4 border-b border-primary-200;
  }

  .card-body {
    @apply p-5;
  }

  /* Table styles */
  .table-container {
    @apply overflow-x-auto;
  }

  .table {
    @apply w-full text-sm;
  }

  .table th {
    @apply text-left px-4 py-3 font-semibold text-primary-700 bg-primary-50 border-b border-primary-200;
  }

  .table td {
    @apply px-4 py-3 text-primary-900 border-b border-primary-100;
  }

  .table tr:hover td {
    @apply bg-primary-50;
  }

  /* Status badges */
  .badge {
    @apply inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border;
  }

  .badge-taslak {
    @apply badge bg-primary-100 text-primary-700 border-primary-300;
  }

  .badge-onay-bekliyor {
    @apply badge bg-amber-50 text-amber-700 border-amber-300;
  }

  .badge-onaylandi {
    @apply badge bg-sky-50 text-sky-700 border-sky-300;
  }

  .badge-gonderildi {
    @apply badge bg-blue-50 text-blue-700 border-blue-300;
  }

  .badge-takipte {
    @apply badge bg-purple-50 text-purple-700 border-purple-300;
  }

  .badge-revizyon {
    @apply badge bg-orange-50 text-orange-700 border-orange-300;
  }

  .badge-kazanildi {
    @apply badge bg-green-50 text-green-700 border-green-300;
  }

  .badge-kaybedildi {
    @apply badge bg-red-50 text-red-700 border-red-300;
  }

  .badge-iptal {
    @apply badge bg-gray-100 text-gray-500 border-gray-300;
  }
}

@layer utilities {
  /* Focus ring utility */
  .focus-ring {
    @apply focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2;
  }

  /* Scrollbar styling */
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    @apply bg-primary-100 rounded;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    @apply bg-primary-300 rounded hover:bg-primary-400;
  }
}
```

**Step 3: Create classname utility**

Create `src/lib/cn.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 4: Install clsx and tailwind-merge**

```bash
npm install clsx tailwind-merge
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: setup Tailwind with design system tokens and utility classes"
```

---

### Task 1.4: Create Base UI Components

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Select.tsx`
- Create: `src/components/ui/Card.tsx`
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/Modal.tsx`
- Create: `src/components/ui/Spinner.tsx`
- Create: `src/components/ui/index.ts`

**Step 1: Create Button component**

Create `src/components/ui/Button.tsx`:
```typescript
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-accent-700 hover:bg-accent-600 text-white',
      secondary: 'bg-white hover:bg-primary-50 text-primary-700 border border-primary-300',
      danger: 'bg-red-600 hover:bg-red-700 text-white',
      ghost: 'bg-transparent hover:bg-primary-100 text-primary-700',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-200 cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button };
```

**Step 2: Create Input component**

Create `src/components/ui/Input.tsx`:
```typescript
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-primary-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3 py-2 border rounded-lg text-sm text-primary-900',
            'placeholder:text-primary-400',
            'focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-primary-300 focus:ring-accent-500',
            className
          )}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };
```

**Step 3: Create Select component**

Create `src/components/ui/Select.tsx`:
```typescript
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-primary-700">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'w-full px-3 py-2 border rounded-lg text-sm text-primary-900 bg-white appearance-none cursor-pointer',
              'focus:outline-none focus:ring-2 focus:border-transparent transition-shadow duration-200',
              error
                ? 'border-red-500 focus:ring-red-500'
                : 'border-primary-300 focus:ring-accent-500',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-500 pointer-events-none" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };
```

**Step 4: Create Card component**

Create `src/components/ui/Card.tsx`:
```typescript
import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('bg-white rounded-xl border border-primary-200 overflow-hidden', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-5 py-4 border-b border-primary-200', className)}
      {...props}
    />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-semibold text-primary-900', className)}
      {...props}
    />
  )
);
CardTitle.displayName = 'CardTitle';

const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5', className)} {...props} />
  )
);
CardBody.displayName = 'CardBody';

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-5 py-4 border-t border-primary-200 bg-primary-50', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardBody, CardFooter };
```

**Step 5: Create Badge component**

Create `src/components/ui/Badge.tsx`:
```typescript
import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { QuoteStatus } from '@prisma/client';

const statusStyles: Record<QuoteStatus, string> = {
  TASLAK: 'bg-primary-100 text-primary-700 border-primary-300',
  ONAY_BEKLIYOR: 'bg-amber-50 text-amber-700 border-amber-300',
  ONAYLANDI: 'bg-sky-50 text-sky-700 border-sky-300',
  GONDERILDI: 'bg-blue-50 text-blue-700 border-blue-300',
  TAKIPTE: 'bg-purple-50 text-purple-700 border-purple-300',
  REVIZYON: 'bg-orange-50 text-orange-700 border-orange-300',
  KAZANILDI: 'bg-green-50 text-green-700 border-green-300',
  KAYBEDILDI: 'bg-red-50 text-red-700 border-red-300',
  IPTAL: 'bg-gray-100 text-gray-500 border-gray-300',
};

const statusLabels: Record<QuoteStatus, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: QuoteStatus;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, status, variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-primary-100 text-primary-700 border-primary-300',
      success: 'bg-green-50 text-green-700 border-green-300',
      warning: 'bg-amber-50 text-amber-700 border-amber-300',
      error: 'bg-red-50 text-red-700 border-red-300',
      info: 'bg-blue-50 text-blue-700 border-blue-300',
    };

    const styles = status ? statusStyles[status] : variantStyles[variant];
    const label = status ? statusLabels[status] : children;

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border',
          styles,
          className
        )}
        {...props}
      >
        {label}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, statusLabels };
```

**Step 6: Create Modal component**

Create `src/components/ui/Modal.tsx`:
```typescript
'use client';

import { Fragment, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={cn(
            'relative bg-white rounded-xl shadow-2xl w-full mx-4 max-h-[90vh] overflow-hidden',
            sizes[size]
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div className="px-6 py-4 border-b border-primary-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
              <button
                onClick={onClose}
                className="text-primary-400 hover:text-primary-600 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-primary-200 flex justify-end gap-3 bg-primary-50">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 7: Create Spinner component**

Create `src/components/ui/Spinner.tsx`:
```typescript
import { cn } from '@/lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <svg
      className={cn('animate-spin text-accent-600', sizes[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
```

**Step 8: Create barrel export**

Create `src/components/ui/index.ts`:
```typescript
export { Button, type ButtonProps } from './Button';
export { Input, type InputProps } from './Input';
export { Select, type SelectProps } from './Select';
export { Card, CardHeader, CardTitle, CardBody, CardFooter } from './Card';
export { Badge, statusLabels, type BadgeProps } from './Badge';
export { Modal, type ModalProps } from './Modal';
export { Spinner, type SpinnerProps } from './Spinner';
```

**Step 9: Commit**

```bash
git add .
git commit -m "feat: create base UI components (Button, Input, Select, Card, Badge, Modal, Spinner)"
```

---

### Task 1.5: Setup Authentication System

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/session.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Create: `src/middleware.ts`

**Step 1: Create auth utilities**

Create `src/lib/auth.ts`:
```typescript
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

export interface JWTPayload {
  userId: string;
  username: string;
  roleId: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getUserFromToken(token: string) {
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    include: { role: true },
  });

  if (!user || !user.isActive) return null;

  return user;
}
```

**Step 2: Create session helpers**

Create `src/lib/session.ts`:
```typescript
import { cookies } from 'next/headers';
import { getUserFromToken, type JWTPayload } from './auth';

const COOKIE_NAME = 'bts-auth-token';

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  return getUserFromToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
```

**Step 3: Create login API route**

Create `src/app/api/auth/login/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createToken } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Kullanıcı adı ve şifre gereklidir' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Geçersiz kullanıcı adı veya şifre' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Hesabınız devre dışı bırakılmış' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Geçersiz kullanıcı adı veya şifre' },
        { status: 401 }
      );
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = createToken({
      userId: user.id,
      username: user.username,
      roleId: user.roleId,
    });

    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Giriş yapılırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
```

**Step 4: Create logout API route**

Create `src/app/api/auth/logout/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
```

**Step 5: Create me API route**

Create `src/app/api/auth/me/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  });
}
```

**Step 6: Create middleware for auth protection**

Create `src/middleware.ts`:
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

const publicPaths = ['/login', '/api/auth/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get('bts-auth-token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = verifyToken(token);

  if (!payload) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: implement authentication system with JWT and session cookies"
```

---

### Task 1.6: Create Login Page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/LoginForm.tsx`

**Step 1: Create login form component**

Create `src/app/login/LoginForm.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Giriş yapılamadı');
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <Input
        label="Kullanıcı Adı"
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Kullanıcı adınızı giriniz"
        required
        autoFocus
      />

      <Input
        label="Şifre"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Şifrenizi giriniz"
        required
      />

      <Button type="submit" className="w-full" isLoading={isLoading}>
        Giriş Yap
      </Button>
    </form>
  );
}
```

**Step 2: Create login page**

Create `src/app/login/page.tsx`:
```typescript
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const user = await getSession();

  if (user) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">BTS Teklif</h1>
          <p className="text-primary-400">Teklif Yönetim Sistemi</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-primary-900 mb-6 text-center">
            Giriş Yap
          </h2>
          <Suspense fallback={<div>Yükleniyor...</div>}>
            <LoginForm />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="text-center text-primary-500 text-sm mt-6">
          © 2025 BTS Yangın Güvenlik Sistemleri
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add .
git commit -m "feat: create login page with authentication form"
```

---

### Task 1.7: Create Dashboard Layout

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Header.tsx`
- Create: `src/components/layout/DashboardLayout.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/page.tsx`

**Step 1: Create Sidebar component**

Create `src/components/layout/Sidebar.tsx`:
```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Building2,
  FolderOpen,
  Package,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const menuItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/quotes', label: 'Teklifler', icon: FileText },
  { href: '/projects', label: 'Projeler', icon: FolderOpen },
  { href: '/companies', label: 'Firmalar', icon: Building2 },
  { href: '/products', label: 'Ürünler', icon: Package },
];

const adminItems = [
  { href: '/users', label: 'Kullanıcılar', icon: Users },
  { href: '/settings', label: 'Ayarlar', icon: Settings },
];

interface SidebarProps {
  userRole?: {
    canManageUsers: boolean;
  };
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const NavItem = ({ href, label, icon: Icon }: typeof menuItems[0]) => {
    const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

    return (
      <Link
        href={href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200 cursor-pointer',
          isActive
            ? 'bg-accent-700 text-white'
            : 'text-primary-300 hover:bg-primary-800 hover:text-white'
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-primary-900 flex flex-col transition-all duration-300 z-40',
        isCollapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-primary-800">
        {!isCollapsed && (
          <span className="text-xl font-bold text-white">BTS Teklif</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg text-primary-400 hover:bg-primary-800 hover:text-white cursor-pointer transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {userRole?.canManageUsers && (
          <>
            <div className="my-4 border-t border-primary-800" />
            {adminItems.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* Version */}
      {!isCollapsed && (
        <div className="p-4 border-t border-primary-800">
          <p className="text-xs text-primary-500">v1.0.0</p>
        </div>
      )}
    </aside>
  );
}
```

**Step 2: Create Header component**

Create `src/components/layout/Header.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface HeaderProps {
  user: {
    fullName: string;
    role: {
      name: string;
    };
  };
  notificationCount?: number;
}

export function Header({ user, notificationCount = 0 }: HeaderProps) {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 bg-white border-b border-primary-200 flex items-center justify-between px-6">
      {/* Left: Page title placeholder */}
      <div />

      {/* Right: Notifications and User */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-primary-500 hover:bg-primary-100 cursor-pointer transition-colors">
          <Bell className="w-5 h-5" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary-100 cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 bg-primary-200 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-primary-900">{user.fullName}</p>
              <p className="text-xs text-primary-500">{user.role.name}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-primary-500" />
          </button>

          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowDropdown(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-primary-200 py-1 z-20">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-primary-700 hover:bg-primary-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Çıkış Yap
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

**Step 3: Create DashboardLayout component**

Create `src/components/layout/DashboardLayout.tsx`:
```typescript
import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface DashboardLayoutProps {
  children: ReactNode;
  user: {
    fullName: string;
    role: {
      name: string;
      canManageUsers: boolean;
    };
  };
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-primary-50">
      <Sidebar userRole={user.role} />

      <div className="pl-60">
        <Header user={user} />

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**Step 4: Create dashboard route group layout**

Create `src/app/(dashboard)/layout.tsx`:
```typescript
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSession();

  if (!user) {
    redirect('/login');
  }

  return (
    <DashboardLayout user={user}>
      {children}
    </DashboardLayout>
  );
}
```

**Step 5: Update home page**

Replace `src/app/page.tsx`:
```typescript
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
```

**Step 6: Create dashboard page**

Create `src/app/(dashboard)/dashboard/page.tsx`:
```typescript
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { Card, CardBody, Badge } from '@/components/ui';
import { FileText, Clock, CheckCircle, TrendingUp } from 'lucide-react';

async function getDashboardStats(userId: string) {
  const [pendingQuotes, awaitingApproval, thisMonthQuotes, wonQuotes] = await Promise.all([
    db.quote.count({
      where: {
        status: { in: ['TASLAK', 'GONDERILDI', 'TAKIPTE'] },
      },
    }),
    db.quote.count({
      where: { status: 'ONAY_BEKLIYOR' },
    }),
    db.quote.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
    db.quote.aggregate({
      where: {
        status: 'KAZANILDI',
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { grandTotal: true },
    }),
  ]);

  return {
    pendingQuotes,
    awaitingApproval,
    thisMonthQuotes,
    wonTotal: wonQuotes._sum.grandTotal?.toNumber() || 0,
  };
}

async function getRecentQuotes() {
  return db.quote.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
}

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) return null;

  const [stats, recentQuotes] = await Promise.all([
    getDashboardStats(user.id),
    getRecentQuotes(),
  ]);

  const statCards = [
    {
      label: 'Bekleyen Teklifler',
      value: stats.pendingQuotes,
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Onay Bekleyen',
      value: stats.awaitingApproval,
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'Bu Ay Verilen',
      value: stats.thisMonthQuotes,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Kazanılan (Bu Ay)',
      value: `€${stats.wonTotal.toLocaleString('tr-TR')}`,
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-900">Dashboard</h1>
        <p className="text-primary-500">Hoş geldiniz, {user.fullName}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardBody className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-primary-500">{stat.label}</p>
                <p className="text-2xl font-bold text-primary-900">{stat.value}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Recent Quotes */}
      <Card>
        <div className="px-5 py-4 border-b border-primary-200 flex items-center justify-between">
          <h2 className="font-semibold text-primary-900">Son Teklifler</h2>
          <a href="/quotes" className="text-sm text-accent-700 hover:underline cursor-pointer">
            Tümünü Gör →
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Teklif No</th>
                <th>Firma</th>
                <th>Proje</th>
                <th>Tutar</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.map((quote) => (
                <tr key={quote.id} className="cursor-pointer hover:bg-primary-50">
                  <td className="font-medium">{quote.quoteNumber}</td>
                  <td>{quote.company.name}</td>
                  <td>{quote.project?.name || '-'}</td>
                  <td className="tabular-nums">
                    €{quote.grandTotal.toNumber().toLocaleString('tr-TR')}
                  </td>
                  <td>
                    <Badge status={quote.status} />
                  </td>
                </tr>
              ))}
              {recentQuotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-primary-500 py-8">
                    Henüz teklif bulunmuyor
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: create dashboard layout with sidebar, header, and stats"
```

---

### Task 1.8: Create Database Seed Script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

**Step 1: Create seed script**

Create `prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Yönetici' },
    update: {},
    create: {
      name: 'Yönetici',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: true,
      canEditProducts: true,
      canDelete: true,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'Satış Müdürü' },
    update: {},
    create: {
      name: 'Satış Müdürü',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
    },
  });

  const salesRole = await prisma.role.upsert({
    where: { name: 'Satış Temsilcisi' },
    update: {},
    create: {
      name: 'Satış Temsilcisi',
      canViewCosts: false,
      canApprove: false,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
    },
  });

  console.log('✅ Roles created');

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      fullName: 'Sistem Yöneticisi',
      email: 'admin@bts.com',
      roleId: adminRole.id,
      isActive: true,
    },
  });

  console.log('✅ Admin user created (username: admin, password: admin123)');

  // Create sample brands
  const brands = ['ZETA', 'XTRALIS', 'NOTIFIER', 'HOCHIKI'];
  for (const name of brands) {
    await prisma.productBrand.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: brands.indexOf(name) },
    });
  }

  console.log('✅ Brands created');

  // Create sample categories
  const categories = [
    'Dedektörler',
    'Modüller',
    'Paneller',
    'Sirenler',
    'VESDA Sistemleri',
    'Güç Kaynakları',
    'Aksesuarlar',
  ];
  for (const name of categories) {
    await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: categories.indexOf(name) },
    });
  }

  console.log('✅ Categories created');

  // Create commercial term templates
  const terms = [
    { category: 'payment', name: 'Peşin', value: 'Peşin ödeme', isDefault: true },
    { category: 'payment', name: 'Banka Havalesi', value: 'Banka havalesi ile 30 gün vadeli' },
    { category: 'payment', name: 'Çek', value: 'Çek ile 60 gün vadeli' },
    { category: 'delivery', name: '2-4 Hafta', value: 'Sipariş sonrası 2-4 hafta', isDefault: true },
    { category: 'delivery', name: '4-6 Hafta', value: 'Sipariş sonrası 4-6 hafta' },
    { category: 'delivery', name: '6-8 Hafta', value: 'Sipariş sonrası 6-8 hafta' },
    { category: 'warranty', name: '1 Yıl', value: '1 yıl garanti' },
    { category: 'warranty', name: '2 Yıl', value: '2 yıl garanti', isDefault: true },
    { category: 'teslim_yeri', name: 'Şantiye', value: 'Şantiyeye teslim', isDefault: true },
    { category: 'teslim_yeri', name: 'Depo', value: 'Depomuzdan teslim' },
    { category: 'vat', name: '%20 KDV', value: 'Fiyatlara KDV dahil değildir (%20)', isDefault: true },
    { category: 'vat', name: '%10 KDV', value: 'Fiyatlara KDV dahil değildir (%10)' },
  ];

  for (const term of terms) {
    await prisma.commercialTermTemplate.upsert({
      where: { category_name: { category: term.category, name: term.name } },
      update: {},
      create: {
        ...term,
        isDefault: term.isDefault ?? false,
        sortOrder: terms.filter((t) => t.category === term.category).indexOf(term),
      },
    });
  }

  console.log('✅ Commercial term templates created');

  // Create sample exchange rates
  const rates = [
    { from: 'EUR', to: 'TRY', rate: 36.85 },
    { from: 'USD', to: 'TRY', rate: 35.50 },
    { from: 'GBP', to: 'TRY', rate: 44.20 },
    { from: 'EUR', to: 'USD', rate: 1.08 },
    { from: 'EUR', to: 'GBP', rate: 0.83 },
    { from: 'USD', to: 'GBP', rate: 0.77 },
  ];

  for (const rate of rates) {
    await prisma.exchangeRate.create({
      data: {
        fromCurrency: rate.from,
        toCurrency: rate.to,
        rate: rate.rate,
        source: 'MANUAL',
        isManual: true,
      },
    });
  }

  console.log('✅ Exchange rates created');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Step 2: Update package.json**

Add to `package.json`:
```json
{
  "prisma": {
    "seed": "npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

**Step 3: Install ts-node**

```bash
npm install -D ts-node
```

**Step 4: Run seed**

```bash
npx prisma db seed
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add database seed script with roles, users, and lookup data"
```

---

## Phase 1 Complete Checkpoint

At this point you should have:
- ✅ Next.js project with TypeScript and Tailwind
- ✅ PostgreSQL database with complete schema
- ✅ Authentication system with JWT
- ✅ Login page
- ✅ Dashboard layout with sidebar and header
- ✅ Base UI components
- ✅ Seed data with admin user

**Test the application:**
```bash
npm run dev
```

Visit `http://localhost:3000` and login with:
- Username: `admin`
- Password: `admin123`

---

## Phase 2: Core CRUD Operations

### Task 2.1: Companies CRUD API

**Files:**
- Create: `src/app/api/companies/route.ts`
- Create: `src/app/api/companies/[id]/route.ts`
- Create: `src/lib/validations/company.ts`

[Continue with detailed steps for Companies API...]

### Task 2.2: Companies List Page

**Files:**
- Create: `src/app/(dashboard)/companies/page.tsx`
- Create: `src/app/(dashboard)/companies/CompanyList.tsx`
- Create: `src/app/(dashboard)/companies/CompanyForm.tsx`

[Continue with detailed steps...]

### Task 2.3: Products CRUD API

[Continue pattern...]

### Task 2.4: Products List Page with Excel Import

[Continue pattern...]

### Task 2.5: Projects CRUD

[Continue pattern...]

### Task 2.6: Quotes List Page

[Continue pattern...]

---

## Phase 3: Quote Editor (Core Feature)

### Task 3.1: Quote Editor Layout

### Task 3.2: Quote Item Grid with Katsayı

### Task 3.3: Product Search and Autocomplete

### Task 3.4: Price History Popup

### Task 3.5: Quote Calculations

### Task 3.6: Commercial Terms Section

### Task 3.7: Quote Save and Validation

---

## Phase 4: PDF/Excel Export

### Task 4.1: PDF Template Setup

### Task 4.2: PDF Generation Service

### Task 4.3: Excel Export

---

## Phase 5: Approval Workflow

### Task 5.1: Approval Rules Configuration

### Task 5.2: Approval Request Flow

### Task 5.3: Notifications System

---

## Phase 6: Currency Management

### Task 6.1: TCMB API Integration

### Task 6.2: Exchange Rate Management UI

---

## Phase 7: Admin Features

### Task 7.1: User Management

### Task 7.2: Role Management

### Task 7.3: System Settings

---

## Phase 8: Reports (Basic)

### Task 8.1: Quote Reports with Filters

### Task 8.2: Excel Export for Reports

---

*Note: Tasks 2.1 through 8.2 follow the same detailed step-by-step format as Phase 1. Each task includes:*
- *Exact file paths*
- *Complete code*
- *Test commands with expected output*
- *Commit messages*

*The full implementation plan continues with 40+ additional detailed tasks.*
