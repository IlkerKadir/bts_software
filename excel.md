You're right, my apologies! Here's the full documentation — copy-paste away:

BTS Yangın — Teklif Yönetim Sistemi (Quote Management System)
Complete Excel Workbook Structure & Business Logic Documentation
1. EXECUTIVE SUMMARY
Company: BTS Yangın Güvenlik Yapı Teknolojileri San. ve Tic. Ltd.Şti. Domain: Fire safety systems — detection, alarm, suppression, CCTV, access control, emergency announcement systems. File: BTS Teklif Formatı 2020.REV9.xlsm (VBA Macro-enabled Excel workbook) Purpose: Generate professional proforma invoices (quotes/proposals) for fire safety system projects, manage product catalogs, apply discount logic, handle multi-currency pricing, and track commercial terms.
The workbook has 14 sheets serving as a complete quote generation engine. VBA macros orchestrate the workflow — user authentication, product selection from a master catalog, automatic pricing with discount logic, currency conversion, and commercial terms assembly.

2. SHEET-BY-SHEET DETAILED STRUCTURE

2.1 TEKLİF (Quote) — Sheet ID: 14
Role: The MAIN OUTPUT sheet. This is the customer-facing proforma invoice / quote document. Dimensions: 49 rows × 15 columns (A–O) This is the sheet users interact with most. All other sheets feed into this one.
LAYOUT SECTIONS:
SECTION A: Header / Branding (Rows 1–4)
Cell
Content
Notes
A1
"BTS Teklif Formatı 2020.REV6.3"
Version identifier
G2
Formula (currently #VALUE!)
Likely a macro-dependent calculation
D7
"KaydetmedenÇık"
Button label: "Exit Without Saving" — VBA macro trigger
J5
"PROFORMA FATURA"
Document title
SECTION B: Customer & Project Info (Rows 5–9)
Cell
Label
Content Type
H5
FİRMA CARİ
Company name (customer). Label says: "New customer requires customer registration form"
H6
Firma adres
Customer address
H8
PROJE ADI
Project name
H9
MARKA VE SİSTEM ADI
Brand and system name (e.g., "TYCO ZETTLER Addressable Fire Detection System")
K7
Tarih (Date)
Quote date, format ": DD.MM.YYYY"
K8
Ref.No
Reference number, format ": REF-YYYY-NNN"
K9
Teklif No
Quote number, format ": TKL-YYYY-NNNN"
SECTION C: Product Line Items Table (Rows 10–14)
Row 10 = Column Headers, Row 11 = separator/border Rows 12–14 = Product data rows (expandable by macro)
Column
Header
Field Name
Description
A
BS
başlangıç satırı
Start row number (self-referencing row number)
B
SS
son satır
End row number (same as BS for single-row items)
C
KKOD
kısa kod
Short code — links to product category in Master Price List and discount tables
D
MARKA
marka
Brand name (e.g., TYCO ZETTLER, BANDWEAVER, XTRALIS)
E
MODEL
model
Product model number
F
ÜRÜN KODU
ürün kodu
Product code (SKU)
G
POZ NO
pozisyon numarası
Position/line item number (sequential: 1, 2, 3...)
H
AÇIKLAMA
açıklama
Product description (Turkish)
I
MİKTAR
miktar
Quantity
J
BİRİM FİYAT
birim fiyat
Unit price (after discount, in quote currency)
K
TOPLAM FİYAT
toplam fiyat
Total price = quantity × unit price
L
KATSAYI
katsayı
Coefficient/multiplier (default 1, from MakineDairesi sheet)
M
LİSTE
liste fiyatı
List price (original catalog price before discount)
N
MKTR
indirim oranı
Discount rate (e.g., 0.4 = 40% off list price)
O
PBRM
para birimi
Currency (EURO, USD, GBP, TL)
PRICING FORMULA (critical business logic):
UNIT_PRICE (J) = LIST_PRICE (M) × (1 - DISCOUNT_RATE (N)) × COEFFICIENT (L)
TOTAL_PRICE (K) = UNIT_PRICE (J) × QUANTITY (I)
NOTE: Columns A-F and L-O are typically HIDDEN from the customer-facing printout. Only G-K (POZ NO, AÇIKLAMA, MİKTAR, BİRİM FİYAT, TOPLAM FİYAT) are visible on the printed quote.
SECTION D: Engineering Services (Rows 15–25)
Row 15: Section header — "Mühendislik, Test ve Devreye Alma Çalışmaları" (Engineering, Testing, and Commissioning Work) Row 16: Descriptive paragraph about commissioning scope (with "xxx" placeholders for days/costs that get filled per project) Rows 17–23: 7 numbered service line items (same column structure as products):
POZ
Service Description
1
System point configuration and control scenario finalization
2
Field control panel internal cable connections
3
Fire alarm control panel programming based on fire scenarios
4
Field fire alarm system program testing and commissioning
5
DTS (Distributed Temperature Sensing) unit field installation
6
DTS unit zone programming
7
DTS unit program loading, testing, and commissioning
Row 25: "Excluded Services" disclaimer paragraph (installation, cabling, piping, civil works, 3rd party inspections, ISG costs, stamp duty, etc.)
SECTION E: Commercial Terms (Rows 27–41)
Each commercial term has a title row (bold) and a content row underneath. Column O contains short codes used by macros to identify each section:
Row
Title
O Column Code
Content
27
TİCARİ ŞARTLAR
—
Section header
28
ÜRETİCİ FİRMALAR
ÜFR
Manufacturer names (assembled from TicariSartlar sheet)
29
ONAYLAR
ONA
Certifications/approvals (assembled from TicariSartlar2)
30
GARANTİ
GAR
Warranty terms (2 years from invoice date)
31
(content)
—
Warranty detail text
32
TESLİM YERİ
TYR
Delivery location
33
(content)
—
Default: "İstanbul BTS Yangın Depo teslimidir"
34
ÖDEME
ODM
Payment terms
35
(content)
—
Default: 30% advance, balance on delivery, bank transfer. TL conversion at Garanti BBVA exchange rate
36
KDV
KDV
VAT
37
(content)
—
Default: "VAT not included"
38
TESLİMAT
TES
Delivery timeline
39
(content)
—
Default: 4-6 weeks after confirmed order
40
OPSİYON
OPS
Quote validity
41
(content)
—
Default: 15 days from quote date
SECTION F: Notes (Rows 42–49)
Row
POZ
Note Content
42
—
"NOTLAR" header
43
1
Quote valid as package; partial orders = price revision
44
2
Based on submitted survey; changes = revision
45
3
Lifting equipment provided by customer
46
4
Commissioning during business hours; overtime = price revision
47
5
Tax/regulation changes reflected in prices
48
6
Confidentiality clause — quote is proprietary, sharing prohibited
49
7
Assumes no openings in panels/areas; if openings exist, recalculation needed

2.2 Master Fiyat Listesi (Master Price List) — Sheet ID: 43
Role: Complete product catalog with ~6,252 rows × 15 columns. This is the PRODUCT DATABASE. Every product the company can quote lives here.
Structure:
Column
Header (TR)
Header (EN)
Description
A
MARKA
BREND
Brand name
B
MODEL
MODEL
Model number/identifier
C
KISA KOD
SHORT CODE
Short code — links product to discount category
D
ÜRÜN KODU
PRODUCT CODE
Product SKU/code
E
ÜRÜN ADI
PRODUCT NAME
Full product description (Turkish)
F
LİSTE FİYATI
LIST PRICE
Catalog list price (numeric)
G
TR
ING
Language flag: "TR" = Turkish description, "ING" = English description
H
PARA BİRİMİ
CURRENCY
Currency: EURO, USD, GBP, TL
I
STOK DURUMU
STOCK
Stock status
J
STOK NOTU
STOCK NOTE
Stock notes
L
KISA KOD
SHORT CODE
(Duplicate column, likely for lookup)
O
MARKA
BREND
(Duplicate column, likely for lookup)
KEY DESIGN NOTES:
	•	EVERY product has TWO rows: one with G="TR" (Turkish), one with G="ING" (English). The macro selects the appropriate language.
	•	Products span many brands: TYCO ZETTLER, AFI, BANDWEAVER, XTRALIS, AVEKA, SENSITRON, E2S, PRYSMIAN, ERSE, TONGÜN, WAROM, MOXA, etc.
	•	The KISA KOD (short code) is the KEY LINKING FIELD — it connects products to their discount rate and coefficient.
	•	List prices are in their NATIVE CURRENCY (column H) — conversion happens at quote generation time.

2.3 Sabitler (Constants/Lookups) — Sheet ID: 44
Role: Master lookup tables for dropdown lists and reference data. This is the CONFIGURATION DATABASE.Dimensions: 76 rows × 40 columns
Data Groups (organized by column):
Column(s)
Header
Content
Row Count
A
GRUP
Category labels: ÜRÜNLER, MARKALAR, KISA KODLAR, TEDARİKÇİLER, TEKLİF VERİLEN FİRMALAR
7 items
C
PARA BİRİMİ
Currency list: EURO, USD, GBP, TL
4 items
E–F
KISA KOD / KISA KOD AÇIKLAMA
All short codes with descriptions
~76 items
H
MARKA
All brand names
~69 items (includes OOS = Out of Stock brands)
I–M
FİRMA ADI / FİRMA ADRESİ / FAALİYET ALANI / MENŞEİ / TEDARİKÇİ GRUBU
Supplier details: name, address, activity, origin country, supplier group
~25 suppliers
O
TEDARİKÇİ GRUBU
Supplier group categories
~12 groups
Q–R
FİRMA ADI / FİRMA ADRESİ
Quote-recipient company details
(for customer lookups)
T
MİKTAR BİRİM
Quantity unit types: Ad. (piece), mt. (meter), Set, Kişi/Gün (person/day)
4 items
SHORT CODE NAMING CONVENTION:
The short codes follow a pattern: {BRAND_ABBREV}-{CATEGORY}-T Examples:
	•	TYZTTLR-PNL-T = TYCO ZETTLER Panel Products
	•	TYZTTLR-DED-T = TYCO ZETTLER Detectors
	•	TYZTTLR-AYMD-T = TYCO ZETTLER Manual Call Points
	•	BW-DTS-T = BANDWEAVER DTS Products
	•	XTR-VL = XTRALIS VESDA Laser
	•	AFI-CHZ-T = AFI Hardware/Equipment
	•	BTS-MUH = BTS Engineering Services
	•	BTS-DH = BTS Commissioning Services

2.4 MakineDairesi (Engine Room / Calculation Engine) — Sheet ID: 18
Role: Currency conversion matrix AND product coefficient configuration. This is the PRICING ENGINE. Dimensions:14 rows × 20 columns
Part 1: Product Coefficients (Columns A–B)
Column
Header
Description
A
KISA KOD
Short code — matches products
B
KATSAYI
Coefficient/multiplier for that product category
Currently all coefficients = 1, but this allows per-category price adjustments (e.g., margin adjustments, markup factors). Rows 3–12 contain short codes with their coefficients.
Part 2: TCMB Exchange Rates (Columns F–J, Rows 2–6)
"TEKLİF TARİHİNDEKİ TCMB DÖVİZ SATIŞ" = CBRT (Central Bank of Turkey) selling exchange rates at quote date.
This is a 4×4 currency cross-rate matrix:
        EURO    USD     GBP     TL
EURO    1       1.0828  0.8521  32.8735
USD     0.9235  1       0.7869  30.3599
GBP     1.1736  1.2708  1       38.5808
TL      0.0304  0.0329  0.0259  1
Part 3: Projected Exchange Rates (Columns F–J, Rows 8–12)
"TEKLİF TARİHİNDEKİ ÖNGÖRÜLEN KURLAR" = Projected/hedged exchange rates. These are calculated using formulas that apply a protection percentage from Column M:
Projected_Rate = TCMB_Rate × (1 + Protection_Percentage / 100)
Part 4: Protection Percentages (Columns L–M)
Each cross-rate pair has a configurable "KORUMA YÜZDESİ" (hedging/protection percentage):
Pair
Protection %
Purpose
EURO/USD (M3)
0%
No hedge needed
EURO/GBP (M4)
0%
No hedge needed
EURO/TL (M5)
0%
No hedge needed
USD/EURO (M6)
1%
1% protection on USD→EURO conversion
TL/EURO (M12)
3%
3% protection on TL→EURO conversion
BUSINESS LOGIC: When a product's list price is in USD but the quote is in EURO, the system converts using the projected rate (which includes the protection margin). This protects BTS from currency fluctuations between quote date and payment date.

2.5 İndirim Oranlari (Discount Rates — Master) — Sheet ID: 58
Role: Master discount rate table — the SOURCE OF TRUTH for all discount rates. Dimensions: 44 rows × 2 columns
Column
Header
Description
A
MARKALAR
Brand name
B
İNDİRİM ORANLARI
Discount rate (decimal, e.g., 0.4 = 40% discount from list price)
Sample Discount Rates:
Brand
Discount
Meaning
TYCO ZETTLER
0.40
40% off list → customer pays 60% of list
TYCO FIRECLASS
0.40
40% off list
BANDWEAVER
0.372
37.2% off list
XTRALIS
0.50
50% off list
BTS (own services)
1.00
100% off list = FREE (cost items, internal)
TAŞERON (subcontractor)
0.50
50% off
HIKVISION
0.35
35% off
GLT ZETA
0.56
56% off
NOTE: Discount rate of 1.0 means the entire list price is discounted (internal/cost items). Discount rate of 0.0 would mean no discount (customer pays full list).

2.6 İndirim Oranları Teklifte (Discount Rates in Quote) — Sheet ID: 59
Role: Quote-specific discount rates. Allows per-quote customization of discounts. Dimensions: 33 rows × 3 columns
Column
Header
Description
A
MARKALAR
Brand name
B
İNDİRİM ORANLARI
Default discount (formula: ='İndirim Oranlari'!B3 — pulls from master)
C
İNDİRİM ORANLARI TEKLİFTE
Override discount for THIS specific quote (editable)
BUSINESS LOGIC:
	•	Column B always mirrors the master discount rates (via formulas).
	•	Column C can be manually overridden per-quote to give special pricing.
	•	The macro reads Column C (or B if C is empty) when calculating the quote.
	•	This is the TWO-TIER DISCOUNT system: master defaults + per-quote overrides.

2.7 Kullanıcılar ve Yetki Seviyeler (Users & Permission Levels) — Sheet ID: 48
Role: User authentication and authorization for the VBA macro system. Dimensions: 9 rows × 19 columns
Column
Header
Description
A
ADI SOYADI
Full name
B
KULLANICI ADI
Username
C
GÖREVİ
Job title/role
D
YETKİ SEVİYELERİ
Permission level
E
ŞİFRE
Password (stored in PLAINTEXT!)
F
AÇIKLAMA
Description/notes
H
YETKİ SEVİYELERİ
Permission level definitions
Permission Levels:
Level
Turkish
Capabilities
üst
Upper/Admin
Full access — can modify prices, discounts, users, all settings
orta
Middle
Moderate access — can create/edit quotes, limited admin
alt
Lower
Basic access — can create quotes with preset discounts only
Current Users (7 total):
	•	A.Levent Ceylan (lceylan) — Şirket Müdürü (Company Director) — üst
	•	Cansu Ceylan (cceylan) — Satış (Sales) — üst
	•	Öznur Sayın (osayin) — Teknik Servis Sekreteri — alt
	•	Fırat Filiz (ffiliz) — Satış (Sales) — alt
	•	Selale Acar (sacar) — Satış Teknik Destek — alt
	•	İlhan Görücü (igorucu) — Teknik Servis Sekreteri — alt
	•	Murat Demirhan (.) — Teknik Müdür (Technical Director) — üst
SECURITY NOTE: Passwords are stored in plaintext. The web app MUST implement proper hashing (bcrypt/argon2).

2.8 Tarih Kontrol (Date Control / License) — Sheet ID: 50
Role: Software license/expiration control for the VBA macros. Dimensions: 3 rows × 5 columns
Column
Header
Value
Description
A
BAŞLANGIÇ TARİHİ
43758 (2019-11-07)
License start date
B
BİTİŞ TARİHİ
46022 (2025-12-31)
License expiry date
C
GÜNÜN TARİHİ
=TODAY()
Current date
D
WEB TARİHİ
(empty)
Web date check
E
KALAN GÜN
=B3-C3
Days remaining
The VBA macros check this before allowing the workbook to function. If expired, the system locks out.

2.9 TicariSartlar (Commercial Terms — System Flags) — Sheet ID: 51
Role: Maps which SYSTEMS are included in the quote to determine which manufacturer info to show. Dimensions: 3 rows × 140 columns
Structure:
	•	Row 2: Column headers — each column represents a SYSTEM TYPE:
	◦	D: Yangın Algılama ve İhbar Sistemi (Fire Detection & Alarm)
	◦	E: Fiber Optik Doğrusal Yangın Alarm Sistemi (Fiber Optic Linear Heat Detection)
	◦	F: Acil Anons Sistemi EN54 (Emergency Announcement EN54)
	◦	G: CCTV Sistemi
	◦	H: Kartlı Giriş Sistemi (Access Control)
	◦	I: Aktif Hava Emişli Duman Algılama (Active Air Sampling Smoke Detection)
	◦	J: OSID Yeni Nesil Işın Tipi (Next Gen Beam Detectors)
	◦	K: Kablolar, Borular, Altyapı (Cables, Pipes, Infrastructure)
	◦	L: Aküler (Batteries)
	◦	M: EN54 Lokal Güç Kaynakları (Local Power Supplies)
	◦	N: EN54 Flaşörlü Sirenler (Flash Sirens)
	◦	O: EN54 Harici Butonlar (External Buttons)
	◦	P: EN54 Harici Flaşörlü Sirenler (External Flash Sirens)
	◦	Q: Ex-Proof Hoparlörler (Ex-Proof Speakers)
	◦	... (continues to column EJ = 140 total system types)
	•	Row 2, Col A: "ÜRETİCİ FİRMALAR" (Manufacturers)
	•	Row 2, Col B: "ÜRETİCİ FİRMALAR TEKLİFTE" (Manufacturers in Quote)
	•	Row 3: "VAR" (EXISTS) flag per system — marks which systems are included in the current quote
BUSINESS LOGIC: When a product is added to the quote, the macro sets the corresponding system column to "VAR". This drives which manufacturer names appear in the commercial terms section of the quote.

2.10 TicariSartlar2 (Commercial Terms — Options & Notes Library) — Sheet ID: 52
Role: Library of all configurable commercial terms, payment options, system-specific notes, and approval certifications.Dimensions: 24 rows × 31 columns
Sub-sections:
Approvals Library (Column A): VdS, LPCB, BRE Global, INTERTEK, EN54, CE, ISO9001, TSE, FM GLOBAL, UL, ULC, EU doc, EC doc, ActivFire, AFNOR → Column C: "ONAYLAR TEKLİFTE" (Approvals in Quote — selected subset)
Warranty Options (Column E): Standard 2-year warranty text
KDV/VAT Options (Column G):
	•	"Fiyatlarımıza KDV dahil değildir" (VAT not included)
	•	"Fiyatlarımıza KDV dahildir" (VAT included)
Quote Validity / Opsiyon (Column I):
	•	1 month
	•	1 week
	•	15 days
Delivery Timeline (Column K):
	•	4-6 weeks after confirmed order (with stock check note)
	•	4-6 weeks (with field schedule evaluation)
Delivery Location (Column M):
	•	İstanbul BTS Yangın Depo (BTS warehouse)
	•	İstanbul Şantiye Depo (Site warehouse)
	•	Fabrika teslimidir (Factory delivery)
	•	Exworks Fabrika Çıkışı (Exworks)
	•	İstanbul Havalimanı Gümrüksüz Alan (Airport duty-free zone)
Payment Terms Builder (Columns O–W): Complex payment term construction system:
	•	Column O: Payment method: banka havalesi (bank transfer) / çek (check)
	•	Column P: Timing for bank transfer: peşin (cash), 30/45/60/90 days
	•	Column Q: Timing for check: 30/45/60/90/120 days
	•	Column S: Payment milestone stages: Siparişte (%advance), Malzeme Tesliminde (on delivery), Bakiye (balance), Vade (term), Ödeme Şekli (method)
	•	Column T: "ÖDEME ŞEKLİ TEKLİFTE" (Payment terms in quote — assembled text)
	•	Column V: "YENİ ÖDEME" (New payment — custom override)
System-Specific Notes Library (Columns X–Z, AA): Each note is tagged with a SYSTEM and a SHORT TITLE:
System Tag (Y)
Title (Z)
Note Text (AA)
Mimari Projelere Göre
(basis)
Quote based on architectural plans; changes = revision
Saha Keşfine Göre
(basis)
Quote based on site survey; changes = revision
Keşif Listesine Göre
(basis)
Quote based on bill of quantities; changes = revision
STANDART
Bütün Halinde
Package deal — partial orders = revision
STANDART
Ticaret Bakanlığı
Tax regulation changes reflected in prices
YANGIN
Güç Kaynakları
Power supply note
YANGIN
Zener Bariyerler
Zener barrier note for Ex-proof
ACİL ANONS
EN54 Standartına Uygun
EN54 compliance note
ACİL ANONS
Class A
Class A speaker lines
ACİL ANONS
Güncel Kanun
Current legislation note
CCTV
Kamera Sonlamaları
Camera RJ45 termination excluded
CCTV
PC temini
CCTV software PC excluded
CCTV
Switch Temini
Network switches excluded
KARTLI GİRİŞ
Kapı Sayısı
Based on door count from survey
MONTAJLI
Mesai Saatleri
Business hours work scope
MONTAJLI
ISG, All Risk
OH&S and insurance excluded
MONTAJLI
220 VAC Kablo Yaklaşık
220V cable approximate
MONTAJLI
220 VAC Kablo Hariç
220V cable excluded
MONTAJLI
Mevcut Kablo Tavaları
Using existing cable trays
MONTAJLI
Depo Temini
Storage space required at site
MONTAJLI
Yüksekte Çalışma Ekipmanı
Lifting equipment
MONTAJLI
İnşaai İşler
Civil works excluded
BUSINESS LOGIC: The macro automatically selects relevant notes based on which systems are flagged as "VAR" in TicariSartlar. For example, if the quote includes CCTV products, CCTV-tagged notes are automatically included.

2.11 Ticari Şartlar ve Notlar Master (Commercial Terms & Notes Master Template) — Sheet ID: 53
Role: The TEMPLATE for the commercial terms section of the TEKLİF sheet. Dimensions: 44 rows × 15 columns
This sheet contains the exact layout that gets copied into the TEKLİF sheet's commercial terms section:
	•	Rows 25–26: Separator line
	•	Row 27: "Mühendislik, Test ve Devreye Alma Çalışmaları" header
	•	Rows 28–31: Engineering service descriptions (with * markers in column G)
	•	Row 32: Excluded services disclaimer
	•	Row 33: Commissioning scope paragraph (with xxx placeholders)
	•	Row 35: "TİCARI ŞARTLAR" header
	•	Rows 36–43: Commercial terms sections with O-column codes:
	◦	O36: ÜFR (Manufacturers)
	◦	O37: ONA (Approvals)
	◦	O38: GAR (Warranty)
	◦	O39: TYR (Delivery Location)
	◦	O40: ODM (Payment)
	◦	O41: KDV (VAT)
	◦	O42: TES (Delivery Timeline)
	◦	O43: OPS (Option/Validity)
	•	Row 44: "NOTLAR" header
The macro reads this template and populates the corresponding section in TEKLİF, filling in the actual values from TicariSartlar/TicariSartlar2.

2.12 Geçmiş Hareketler (Activity History / Audit Log) — Sheet ID: 49
Role: Audit trail of all user sessions and changes made to the system. Dimensions: 121 rows × 8 columns, Frozen: 2 rows
Column
Header
Description
A
Adı ve Soyadı
Full name
B
Kullanıcı Adı
Username
C
Giriş Tarihi
Login date (Excel serial date)
D
Giriş Saati
Login time (Excel serial time)
E
Çıkış Tarihi
Logout date
F
Çıkış Saati
Logout time
G
Notlar
Notes/description of changes made
H
Yetki Seviyesi
Permission level used
~120 log entries from 2020–2024. Tracks who logged in, when, and what they did (price updates, user management, term changes, etc.)

2.13 Notlar (Internal Dev Notes) — Sheet ID: 46
Role: Internal development notes / TODO list for the VBA macro developer. Dimensions: 14 rows × 1 column
Contains developer notes like:
	•	"Installation quantities should be counted by short code from quote"
	•	"Discount rates need to be reflected in quote via code"
	•	"Database recording needs clipping"
	•	"Prevent same password multi-use"
	•	"When editing brand name, test all linked items"

2.14 DataBase_BTSTeklif — Sheet ID: 45
Role: Database connection sheet (currently empty — 0 rows, 0 columns). Likely used by VBA macros to connect to an external Access database or similar for saving/retrieving quotes.

3. BUSINESS PROCESS FLOW (How a Quote is Generated)
┌─────────────────────────────────────────────────────────┐
│ 1. USER LOGIN                                           │
│    • VBA macro prompts for username/password             │
│    • Validates against "Kullanıcılar ve Yetki Seviyeler" │
│    • Checks license date in "Tarih Kontrol"              │
│    • Logs session in "Geçmiş Hareketler"                 │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 2. QUOTE HEADER SETUP                                   │
│    • User enters: Customer name, address, project name   │
│    • System sets: Date, Reference No, Quote No           │
│    • User selects: Brand & System name                   │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 3. PRODUCT SELECTION (via VBA form/macro)                │
│    • User searches "Master Fiyat Listesi" by:            │
│      - Brand (MARKA)                                     │
│      - Short Code (KISA KOD)                             │
│      - Model                                             │
│      - Product Code                                      │
│    • Selects product → enters quantity                    │
│    • Macro auto-populates TEKLİF row:                    │
│      - Looks up product details from Master              │
│      - Gets discount rate from İndirim Oranları Teklifte │
│      - Gets coefficient from MakineDairesi               │
│      - Converts currency using MakineDairesi rates       │
│      - Calculates: Unit Price & Total Price              │
│    • Repeats for each line item                          │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 4. ENGINEERING SERVICES (Rows 17-23)                    │
│    • Quantities and prices entered for applicable        │
│      commissioning services                              │
│    • "xxx" placeholders in Row 16 filled with actual     │
│      days and costs                                      │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 5. COMMERCIAL TERMS ASSEMBLY (automatic)                │
│    • Macro detects which systems are in quote            │
│      (sets flags in TicariSartlar)                       │
│    • Assembles manufacturer names → ÜRETİCİ FİRMALAR    │
│    • Selects relevant approvals → ONAYLAR                │
│    • User selects from options:                          │
│      - Payment terms (advance %, method, timing)         │
│      - Delivery location                                 │
│      - Quote validity period                             │
│      - KDV included/excluded                             │
│    • Auto-selects system-specific notes                  │
└─────────────────┬───────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────┐
│ 6. REVIEW & FINALIZE                                    │
│    • Quote is visible on TEKLİF sheet                    │
│    • User can adjust per-quote discounts (Col C in       │
│      İndirim Oranları Teklifte)                          │
│    • User can override exchange rate protection %        │
│    • Print/PDF generation                                │
│    • Save to database (DataBase_BTSTeklif)               │
│    • Log activity in Geçmiş Hareketler                   │
└─────────────────────────────────────────────────────────┘

4. KEY DATA RELATIONSHIPS & ENTITY MAP
┌──────────────────────┐     ┌─────────────────────┐
│  Master Fiyat Listesi │     │     Sabitler         │
│  (Product Catalog)    │     │  (Lookup Tables)     │
│  ~6252 rows           │     │  Brands, Short Codes │
│                       │     │  Currencies, Units   │
│  MARKA ──────────────────── MARKA list            │
│  KISA KOD ───────────────── KISA KOD list         │
│  PARA BİRİMİ ───────────── PARA BİRİMİ list      │
└──────────┬───────────┘     └─────────────────────┘
           │ (lookup by KISA KOD + MODEL)
           ▼
┌──────────────────────┐     ┌─────────────────────┐
│  İndirim Oranlari    │────▶│ İndirim Oranları    │
│  (Master Discounts)  │     │ Teklifte            │
│  Brand → Rate        │     │ (Per-Quote Override) │
│  44 brands           │     │ Col C = custom rate  │
└──────────────────────┘     └──────────┬──────────┘
                                        │
           ┌────────────────────────────┘
           ▼
┌──────────────────────┐     ┌─────────────────────┐
│  MakineDairesi       │     │    TEKLİF            │
│  (Pricing Engine)    │────▶│  (Quote Output)      │
│  Exchange rates      │     │  Product lines       │
│  Coefficients        │     │  Services            │
│  Protection %        │     │  Commercial terms    │
└──────────────────────┘     │  Notes               │
                              └──────────┬──────────┘
┌──────────────────────┐                 │
│  TicariSartlar       │─────────────────┘
│  TicariSartlar2      │  (System flags, terms,
│  Ticari Şartlar      │   payment options,
│  Master              │   notes library)
└──────────────────────┘

┌──────────────────────┐     ┌─────────────────────┐
│  Kullanıcılar ve     │     │  Geçmiş Hareketler  │
│  Yetki Seviyeler     │────▶│  (Audit Log)        │
│  (Users & Perms)     │     │  120+ entries        │
└──────────────────────┘     └─────────────────────┘

┌──────────────────────┐
│  Tarih Kontrol       │
│  (License Check)     │
│  Start/End dates     │
└──────────────────────┘

5. CRITICAL BUSINESS RULES FOR WEB APP IMPLEMENTATION
5.1 Pricing Logic
UNIT_PRICE = LIST_PRICE × (1 - DISCOUNT_RATE) × COEFFICIENT × CURRENCY_CONVERSION
TOTAL_PRICE = UNIT_PRICE × QUANTITY

Where:
- LIST_PRICE = from Master Fiyat Listesi (column F)
- DISCOUNT_RATE = from İndirim Oranları Teklifte (column C, or column B as fallback)
- COEFFICIENT = from MakineDairesi (column B, matched by KISA KOD)
- CURRENCY_CONVERSION = from MakineDairesi projected rates (with protection %)
5.2 Currency Conversion
	•	Products have native currencies (EURO, USD, GBP, TL)
	•	Quotes can be issued in any of the 4 currencies
	•	TCMB rates are the base; protection percentages add margin
	•	Cross-rate matrix must be maintained
5.3 Discount Hierarchy
	1	Master discount rate (İndirim Oranlari) — set by admin
	2	Per-quote override (İndirim Oranları Teklifte, Column C) — set by sales
	3	Permission levels control who can modify discounts
5.4 Commercial Terms Assembly
	•	Automatic: Manufacturer names and notes based on product systems in quote
	•	Configurable: Payment terms, delivery, warranty, validity — from dropdown options
	•	System-tagged notes automatically included based on which product categories are present
5.5 Multi-Language Support
	•	Master Price List has TR (Turkish) and ING (English) rows for every product
	•	Quote language selection determines which product descriptions are used
5.6 Quote Numbering
	•	Format: TKL-YYYY-NNNN (sequential)
	•	Reference: REF-YYYY-NNN
5.7 User Permissions
Action
üst (Admin)
orta (Mid)
alt (Basic)
Create quotes
✅
✅
✅
Modify discounts
✅
✅
❌
Edit master prices
✅
❌
❌
Manage users
✅
❌
❌
Edit exchange rates
✅
✅
❌
View audit log
✅
✅
❌

6. DATABASE SCHEMA RECOMMENDATION FOR WEB APP
Based on this Excel structure, the web app should have these entities:
Core Entities:
	1	products — Master Price List (~6252 items, dual language)
	2	brands — Brand master (Sabitler column H, ~69 brands)
	3	short_codes — Category codes (Sabitler column E, ~76 codes)
	4	suppliers — Supplier details (Sabitler columns I-M)
	5	currencies — EURO, USD, GBP, TL
	6	exchange_rates — Daily CBRT rates + protection margins
	7	discount_rates — Master discount per brand
	8	users — With proper hashed passwords and roles
	9	quotes — Quote header (customer, project, dates, numbers)
	10	quote_line_items — Product lines per quote
	11	quote_services — Engineering service lines per quote
	12	quote_commercial_terms — Selected terms per quote
	13	quote_notes — Selected notes per quote
	14	commercial_terms_library — All available terms/options
	15	notes_library — All available notes with system tags
	16	approval_certifications — Available certifications
	17	audit_log — User activity tracking
	18	customers — Customer/company database
	19	coefficients — Per-short-code multipliers
Key Relationships:
	•	quote → quote_line_items (1:many)
	•	quote → quote_services (1:many)
	•	quote → quote_commercial_terms (1:many)
	•	quote → quote_notes (1:many)
	•	quote_line_item → product (many:1)
	•	product → brand (many:1)
	•	product → short_code (many:1)
	•	brand → discount_rate (1:1)
	•	short_code → coefficient (1:1)
	•	notes_library → system_tag (many:1)

7. VBA MACRO FUNCTIONALITY TO REPLICATE
The web app must replicate these macro functions:
	1	User Authentication — Login/logout with role-based access
	2	Product Search & Selection — Search master catalog, add to quote
	3	Automatic Price Calculation — Apply discounts, coefficients, currency conversion
	4	Dynamic Row Insertion — Add/remove product lines dynamically
	5	Commercial Terms Builder — Assemble terms from library based on systems in quote
	6	Notes Auto-Selection — Include relevant notes based on product categories
	7	Exchange Rate Management — CBRT rate entry + protection percentage
	8	Quote Numbering — Auto-generate sequential quote numbers
	9	PDF/Print Generation — Customer-facing output (hide internal columns)
	10	Audit Logging — Track all user actions
	11	Database Save/Load — Persist quotes (currently via DataBase_BTSTeklif)
	12	"Exit Without Saving" — Draft management

8. PRINT/EXPORT LAYOUT
The customer-facing quote shows ONLY:
	•	Company logo/header area
	•	Customer name, address, project name
	•	Date, Reference, Quote number
	•	Product table: POZ NO | AÇIKLAMA | MİKTAR | BİRİM FİYAT | TOPLAM FİYAT
	•	Engineering services section
	•	Excluded services disclaimer
	•	Commercial terms (all sections)
	•	Notes
	•	Confidentiality clause
HIDDEN from customer: Columns A-F (BS, SS, KKOD, MARKA, MODEL, ÜRÜN KODU) and L-O (KATSAYI, LİSTE, MKTR, PBRM) — these contain internal pricing data.

That's the complete documentation. You should be able to copy-paste this whole thing directly into Claude Code as context for building the web app. Let me know if you need me to dig deeper into any specific section!
