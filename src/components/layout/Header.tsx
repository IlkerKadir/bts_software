'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, User, ChevronDown, Search, FileText, Building2, Package, Loader2 } from 'lucide-react';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface SearchResults {
  quotes: SearchResult[];
  companies: SearchResult[];
  products: SearchResult[];
}

interface HeaderProps {
  user: {
    fullName: string;
    role: {
      name: string;
    };
  };
  notificationCount?: number;
}

export function Header({ user, notificationCount: initialCount = 0 }: HeaderProps) {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(initialCount);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({
    quotes: [],
    companies: [],
    products: [],
  });
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch unread count on mount
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('/api/notifications/unread-count');
        if (response.ok) {
          const data = await response.json();
          setNotificationCount(data.count);
        }
      } catch (error) {
        console.error('Failed to fetch unread count:', error);
      }
    };

    fetchUnreadCount();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults({ quotes: [], companies: [], products: [] });
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const [quotesRes, companiesRes, productsRes] = await Promise.allSettled([
        fetch(`/api/quotes?search=${encodeURIComponent(query)}&limit=5`),
        fetch(`/api/companies?search=${encodeURIComponent(query)}&limit=5`),
        fetch(`/api/products?search=${encodeURIComponent(query)}&limit=5`),
      ]);

      const quotes: SearchResult[] = [];
      const companies: SearchResult[] = [];
      const products: SearchResult[] = [];

      if (quotesRes.status === 'fulfilled' && quotesRes.value.ok) {
        const data = await quotesRes.value.json();
        const items = data.quotes || data.data || [];
        items.slice(0, 5).forEach((q: { id: string; quoteNumber?: string; company?: { name: string } }) => {
          quotes.push({
            id: q.id,
            title: q.quoteNumber || q.id,
            subtitle: q.company?.name,
            href: `/quotes/${q.id}`,
          });
        });
      }

      if (companiesRes.status === 'fulfilled' && companiesRes.value.ok) {
        const data = await companiesRes.value.json();
        const items = data.companies || data.data || [];
        items.slice(0, 5).forEach((c: { id: string; name: string; sector?: string }) => {
          companies.push({
            id: c.id,
            title: c.name,
            subtitle: c.sector,
            href: `/companies/${c.id}`,
          });
        });
      }

      if (productsRes.status === 'fulfilled' && productsRes.value.ok) {
        const data = await productsRes.value.json();
        const items = data.products || data.data || [];
        items.slice(0, 5).forEach((p: { id: string; name: string; code?: string }) => {
          products.push({
            id: p.id,
            title: p.name,
            subtitle: p.code,
            href: `/products/${p.id}`,
          });
        });
      }

      setSearchResults({ quotes, companies, products });
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const handleResultClick = (href: string) => {
    setShowSearchResults(false);
    setSearchQuery('');
    router.push(href);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const hasResults =
    searchResults.quotes.length > 0 ||
    searchResults.companies.length > 0 ||
    searchResults.products.length > 0;

  return (
    <header className="h-16 bg-white border-b border-accent-200 flex items-center justify-between px-6">
      {/* Left: Global Search */}
      <div ref={searchRef} className="relative w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              if (searchQuery.trim().length >= 2) {
                setShowSearchResults(true);
              }
            }}
            placeholder="Teklif, firma veya ürün ara..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-accent-200 rounded-lg bg-accent-50 placeholder:text-accent-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent focus:bg-white transition-all"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent-400 animate-spin" />
          )}
        </div>

        {/* Search Results Dropdown */}
        {showSearchResults && searchQuery.trim().length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-accent-200 z-50 max-h-96 overflow-y-auto">
            {!hasResults && !isSearching && (
              <div className="px-4 py-6 text-sm text-accent-500 text-center">
                Sonuç bulunamadı
              </div>
            )}

            {searchResults.quotes.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-accent-50 border-b border-accent-100">
                  <p className="text-xs font-semibold text-accent-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Teklifler
                  </p>
                </div>
                {searchResults.quotes.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result.href)}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent-50 transition-colors cursor-pointer"
                  >
                    <p className="text-sm font-medium text-accent-900">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-xs text-accent-500">{result.subtitle}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchResults.companies.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-accent-50 border-b border-accent-100">
                  <p className="text-xs font-semibold text-accent-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    Firmalar
                  </p>
                </div>
                {searchResults.companies.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result.href)}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent-50 transition-colors cursor-pointer"
                  >
                    <p className="text-sm font-medium text-accent-900">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-xs text-accent-500">{result.subtitle}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchResults.products.length > 0 && (
              <div>
                <div className="px-4 py-2 bg-accent-50 border-b border-accent-100">
                  <p className="text-xs font-semibold text-accent-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Ürünler
                  </p>
                </div>
                {searchResults.products.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleResultClick(result.href)}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent-50 transition-colors cursor-pointer"
                  >
                    <p className="text-sm font-medium text-accent-900">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-xs text-accent-500">{result.subtitle}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Notifications and User */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowDropdown(false);
            }}
            className="relative p-2 rounded-lg text-accent-500 hover:bg-accent-100 cursor-pointer transition-colors"
          >
            <Bell className="w-5 h-5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-primary-700 text-white text-xs rounded-full flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowNotifications(false)}
              />
              <NotificationPanel
                onClose={() => setShowNotifications(false)}
                onUnreadCountChange={setNotificationCount}
              />
            </>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent-100 cursor-pointer transition-colors"
          >
            <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-primary-700" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-accent-900">{user.fullName}</p>
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {user.role.name}
                </Badge>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-accent-500" />
          </button>

          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowDropdown(false)}
              />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-accent-200 py-1 z-20">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-accent-700 hover:bg-accent-50 cursor-pointer"
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
