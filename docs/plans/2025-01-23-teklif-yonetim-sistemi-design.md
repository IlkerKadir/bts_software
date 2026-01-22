# BTS Teklif Yönetim Sistemi - Design Document

**Date:** 2025-01-23
**Client:** BTS Yangın Güvenlik Sistemleri
**Status:** Approved

---

## 1. Executive Summary

A web-based quote management system (Teklif Yönetim Sistemi) for a fire security systems company. Replaces their current Excel/macro-based workflow for preparing 20-30 quotes daily. Key goals:

- Speed up quote preparation with familiar spreadsheet-like interface
- Track all quotes by client, partner, project, and sales rep
- See historical pricing when preparing new quotes
- Maintain exact PDF/Excel output format
- Role-based access (managers see costs, sales reps see only list prices)

---

## 2. Technical Architecture

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Browser                         │
│                   (Responsive Web App)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────────┐
│                    Application Server                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Next.js   │  │   REST API  │  │   PDF/Excel Gen     │  │
│  │  Frontend   │  │   Backend   │  │     Service         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  PostgreSQL  │ │  File    │ │    TCMB      │
│   Database   │ │  Storage │ │  (External)  │
└──────────────┘ └──────────┘ └──────────────┘
```

### 2.2 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js + React (TypeScript) |
| Backend | Node.js with Express/Fastify |
| Database | PostgreSQL |
| PDF Generation | Puppeteer or pdf-lib |
| Excel Generation | ExcelJS |
| Authentication | Simple username/password (bcrypt) |
| Deployment | On-premise (customer's servers) |

### 2.3 Key Decisions

- **Single language (TypeScript)** across frontend and backend for faster development
- **PostgreSQL** for complex relational queries (quotes, projects, products)
- **Responsive web** - works on desktop (primary) and mobile/tablet
- **Local file storage** for documents (database stores paths)
- **No external integrations** for MVP - standalone system

---

## 3. Database Schema

### 3.1 Core Entities

```
┌─────────────────┐       ┌─────────────────┐
│     Company     │       │     Project     │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ name            │       │ name            │
│ type (client/   │◄──────│ client_id (FK)  │
│      partner)   │       │ status          │
│ address         │       │ estimated_start │
│ tax_number      │       │ estimated_end   │
│ contacts (JSON) │       │ notes           │
│ created_at      │       │ created_at      │
└─────────────────┘       └────────┬────────┘
                                   │ 1:N
                                   ▼
┌─────────────────┐       ┌─────────────────┐
│    Product      │       │     Quote       │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ code            │       │ quote_number    │
│ short_code      │       │ project_id (FK) │ ◄── nullable for standalone
│ brand           │       │ company_id (FK) │ ◄── client or partner
│ model           │       │ currency        │
│ name            │       │ exchange_rate   │
│ category        │       │ protection_pct  │
│ unit            │       │ subtotal        │
│ list_price      │       │ discount_total  │
│ cost_price      │       │ vat_total       │
│ supplier        │       │ grand_total     │
│ is_active       │       │ status          │
└─────────────────┘       │ valid_until     │
        │                 │ version         │
        │                 │ parent_quote_id │ ◄── for revisions
        │                 │ created_by (FK) │
        │                 │ approved_by     │
        │                 │ created_at      │
        │                 └────────┬────────┘
        │                          │ 1:N
        │                          ▼
        │                 ┌─────────────────┐
        │                 │   QuoteItem     │
        │                 ├─────────────────┤
        └────────────────►│ id              │
           optional link  │ quote_id (FK)   │
                         │ product_id (FK) │ ◄── nullable for ad-hoc
                         │ sort_order      │
                         │ item_type       │ ◄── product/header/note
                         │ code            │
                         │ brand           │
                         │ description     │
                         │ quantity        │
                         │ unit            │
                         │ list_price      │
                         │ katsayi         │ ◄── coefficient/multiplier
                         │ unit_price      │
                         │ discount_pct    │
                         │ vat_rate        │
                         │ total_price     │
                         │ notes           │
                         └─────────────────┘
```

### 3.2 Supporting Tables

```
┌─────────────────┐       ┌─────────────────┐
│      User       │       │      Role       │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ username        │       │ name            │
│ password_hash   │       │ can_view_costs  │
│ full_name       │       │ can_approve     │
│ email           │       │ can_export      │
│ role_id (FK)    │◄──────│ can_manage_users│
│ is_active       │       │ can_edit_products│
│ last_login      │       │ can_delete      │
└─────────────────┘       └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│ ExchangeRate    │       │ ApprovalRule    │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ from_currency   │       │ name            │
│ to_currency     │       │ condition_type  │ ◄── value/discount/katsayi
│ rate            │       │ condition_op    │ ◄── gt/lt/eq
│ source          │       │ condition_value │
│ fetched_at      │       │ requires_role   │
│ is_manual       │       │ is_active       │
└─────────────────┘       └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│ CommercialTerm  │       │  QuoteDocument  │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ category        │       │ quote_id (FK)   │
│ name            │       │ file_name       │
│ value_tr        │       │ file_path       │
│ is_default      │       │ file_type       │
│ sort_order      │       │ uploaded_by     │
└─────────────────┘       │ uploaded_at     │
                          └─────────────────┘

┌─────────────────┐       ┌─────────────────┐
│ QuoteHistory    │       │  Notification   │
├─────────────────┤       ├─────────────────┤
│ id              │       │ id              │
│ quote_id (FK)   │       │ user_id (FK)    │
│ user_id (FK)    │       │ type            │
│ action          │       │ title           │
│ changes (JSON)  │       │ message         │
│ created_at      │       │ link            │
└─────────────────┘       │ is_read         │
                          │ created_at      │
┌─────────────────┐       └─────────────────┘
│ PriceHistory    │
├─────────────────┤
│ id              │
│ product_id (FK) │
│ company_id (FK) │
│ quote_id (FK)   │
│ unit_price      │
│ katsayi         │
│ currency        │
│ quoted_at       │
└─────────────────┘
```

### 3.3 Key Design Decisions

- **Quote.company_id** can point to client OR partner (same table with type flag)
- **QuoteItem.product_id** nullable to allow ad-hoc items not in catalog
- **QuoteItem.item_type** supports headers, notes, separators between product rows
- **Quote.parent_quote_id** links revisions to original quote
- **PriceHistory** auto-populated when quotes created, powers historical lookup
- **Full currency matrix** - EUR/USD, EUR/GBP, USD/GBP, plus all TL pairs

---

## 4. User Interface Design

### 4.1 Quote Editor

Hybrid approach: spreadsheet grid for line items with smart dropdowns and autocomplete.

**Line Item Grid:**

```
┌───┬──────┬───────┬─────────────────┬───────┬───────┬───────┬─────┬───────┐
│ # │ Kod  │ Marka │ Açıklama        │Liste F│Katsayı│B.Fiyat│Adet │Toplam │
├───┼──────┼───────┼─────────────────┼───────┼───────┼───────┼─────┼───────┤
│ 1 │ ZX-P │ZETA   │Optik Duman Ded. │ €100  │ 0.85  │ €85   │ 45  │€3,825 │
│ 2 │ ZX-H │ZETA   │Sıcaklık Dedek.  │ €80   │ 0.90  │ €72   │ 12  │ €864  │
└───┴──────┴───────┴─────────────────┴───────┴───────┴───────┴─────┴───────┘
```

**Katsayı Calculation:**
- Liste Fiyat × Katsayı = Birim Fiyat
- Katsayı defaults to 1.0, sales rep adjusts (e.g., 0.85 for 15% below list)

**Key Features:**
- Smart product search with autocomplete
- Keyboard navigation (Tab/Enter)
- Section headers for grouping items
- Drag & drop reordering
- Ad-hoc items (not in catalog)
- Auto-calculate totals
- Price history lookup button (🔍)

### 4.2 Dashboard

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Bekleyen    │ │   Onay       │ │  Bu Ay       │ │  Kazanılan   │
│  Teklifler   │ │  Bekleyen    │ │  Verilen     │ │  (Bu Ay)     │
│     24       │ │      5       │ │     87       │ │   €245,000   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

- Quick actions: Yeni Teklif, Yeni Proje, Yeni Firma
- Recent quotes list
- Notifications (pending approvals, expiring quotes, follow-ups)

### 4.3 Quote Statuses

| Durum | Açıklama |
|-------|----------|
| Taslak | Hazırlanıyor |
| Onay Bekliyor | Yönetici onayı bekliyor |
| Onaylandı | Gönderilebilir |
| Gönderildi | Müşteriye gönderildi |
| Takipte | Yanıt bekleniyor |
| Revizyon | Değişiklik istendi |
| Kazanıldı | Sipariş alındı |
| Kaybedildi | Reddedildi |
| İptal | İptal edildi |

### 4.4 Multiple Views

- **Müşteri bazlı** - All quotes to a specific client/partner
- **Proje bazlı** - All quotes for a project (multiple partners)
- **Temsilci bazlı** - Quotes by sales rep
- **Durum bazlı** - Filter by status

### 4.5 Price History Popup

Shows when clicking 🔍 button on a product:
- Previous prices to this specific company
- All recent prices across all companies
- Statistics: average, min, max
- Quick "apply this price" button

---

## 5. Key Features

### 5.1 Multi-Currency Support

- Currencies: EUR, USD, GBP, TL
- Full cross-rate matrix (EUR/USD, EUR/GBP, USD/GBP, etc.)
- Auto-fetch daily rates from TCMB (Turkish Central Bank)
- Manual override per quote
- Protection percentage (kur koruma) to buffer against fluctuations

### 5.2 Approval Workflow

Configurable rules based on:
- Quote total value (e.g., > €10,000 requires Satış Müdürü)
- Discount percentage (e.g., > 15% requires approval)
- Katsayı threshold (e.g., < 0.80 requires Yönetici)
- Always require approval (optional)

Multiple rules can apply - highest authority required wins.

### 5.3 Role-Based Access

| Permission | Satış Tem. | Satış Müd. | Yönetici |
|------------|:----------:|:----------:|:--------:|
| Create quotes | ✓ | ✓ | ✓ |
| Edit own quotes | ✓ | ✓ | ✓ |
| Edit all quotes | - | ✓ | ✓ |
| View cost prices | - | ✓ | ✓ |
| View profit margin | - | ✓ | ✓ |
| Export PDF/Excel | ✓* | ✓ | ✓ |
| Approve quotes | - | ✓ | ✓ |
| Manage products | - | - | ✓ |
| Manage users | - | - | ✓ |

*Only for approved quotes

### 5.4 Project Management

- Projects linked to a client
- Multiple quotes per project (to different partners)
- Side-by-side comparison of quotes for same project
- Documents attached at project level
- Notes and activity timeline

### 5.5 Version Control

- Automatic versioning (v1, v2, v3...)
- Full history of changes (who, when, what)
- Compare versions
- Revert to previous version if needed

---

## 6. PDF/Excel Output

### 6.1 Template Structure

Matches their current Excel format exactly:
- Header: Logo, company info, quote number, date, validity
- Customer info: Company name, project reference
- Line items: Grouped with section headers
- Totals: Subtotal, discount, VAT, grand total
- Commercial terms: Payment, delivery, warranty, notes
- Footer: Sales rep contact info

### 6.2 Template Editor

Admin can customize:
- Logo image
- Company information
- Default commercial terms text
- Footer content
- Colors and fonts (limited)

---

## 7. Data Migration

### 7.1 Scope

- **Products only** - Import master price list (~3000+ products) from Excel
- Quotes start fresh in new system
- Historical data remains in old Excel for reference

### 7.2 Import Format

Excel columns mapped:
- Ürün Kodu → code
- Kısa Kod → short_code
- Marka → brand
- Model → model
- Ürün Adı → name
- Liste Fiyat → list_price
- Maliyet → cost_price
- Tedarikçi → supplier

---

## 8. Implementation Phases

### Phase 1 - Core System (MVP)

| Module | Features |
|--------|----------|
| Auth & Users | Login, user management, roles, permissions |
| Products | Product catalog, categories, brands, Excel import |
| Companies | Client/partner management, contacts |
| Quote Editor | Hybrid grid, katsayı, ad-hoc items, auto-calc |
| Quote Management | List, filter, status tracking, versioning |
| PDF/Excel Export | Basic template matching their format |
| Currency | Multi-currency, TCMB auto-fetch, protection % |

### Phase 2 - Enhanced Workflow

| Module | Features |
|--------|----------|
| Projects | Project management, multi-quote per project |
| Approval System | Configurable rules, approval workflow |
| Price History | Historical lookup popup |
| Documents | File attachments at project/quote level |
| Notifications | In-app notifications, reminders |
| Commercial Terms | Reusable terms library |

### Phase 3 - Polish & Optimization

| Module | Features |
|--------|----------|
| Template Editor | Admin UI for PDF/Excel customization |
| Bulk Operations | Mass price updates, bulk status changes |
| Advanced Filters | Saved filters, custom views |
| Audit Log | Full history of who changed what |
| Reports | Basic reports with Excel export |

### Future (on request)

- Dashboard analytics & charts
- Email integration (send quotes directly)
- Order confirmation module (Sipariş Teyit Formu)
- Accounting system integration

---

## 9. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| Users | 5-15 concurrent users |
| Language | Turkish UI only |
| Platform | Web (responsive - desktop primary, mobile secondary) |
| Deployment | On-premise (customer's servers) |
| Authentication | Username/password |
| Data Storage | PostgreSQL + local file system |
| Backup | Customer's responsibility (standard DB backup) |

---

## 10. Open Items / Future Considerations

1. **PDF template** - Initial version matches current format; will be refined after user testing
2. **Email integration** - Can be added later if needed
3. **Dashboard analytics** - Phase 3 or future enhancement
4. **Sipariş Teyit** - Order confirmation module for future phase
5. **Mobile app** - Not needed; responsive web is sufficient

---

## Appendix A: Existing Excel Structure

The current Excel file (`BTS Teklif Formatı 2020.REV9.xlsm`) contains:

**Visible Sheet:**
- TEKLİF - Main quote template

**Hidden Data Sheets:**
- Master Fiyat Listesi - Product price list (~3000+ products)
- DataBase_BTSTeklif - Quote database
- Geçmiş Hareketler - Transaction history
- Kullanıcılar ve Yetki Seviyeler - Users & permissions
- Sabitler - Constants (groups, currencies, brands, suppliers, units)
- TicariSartlar / TicariSartlar2 - Commercial terms
- İndirim Oranları - Discount rates

**Product Categories:**
- Fire detection (smoke, heat, flame detectors)
- Addressable modules (input/output)
- Sirens and beacons
- Control panels
- VESDA/aspirating systems
- Power supplies
- Accessories

**Brands:** ZETA, XTRALIS, and others

---

*Document prepared: 2025-01-23*
