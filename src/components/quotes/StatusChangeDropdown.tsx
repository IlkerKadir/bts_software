'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';

interface StatusOption {
  value: string;
  label: string;
}

interface StatusChangeDropdownProps {
  quoteId: string;
  currentStatus: string;
  currentStatusLabel: string;
  onStatusChange: () => void;
}

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  TASLAK: 'default',
  ONAY_BEKLIYOR: 'warning',
  ONAYLANDI: 'info',
  GONDERILDI: 'info',
  TAKIPTE: 'warning',
  REVIZYON: 'warning',
  KAZANILDI: 'success',
  KAYBEDILDI: 'error',
  IPTAL: 'error',
};

export function StatusChangeDropdown({
  quoteId,
  currentStatus,
  currentStatusLabel,
  onStatusChange,
}: StatusChangeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [transitions, setTransitions] = useState<StatusOption[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTransitions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/status`);
      if (response.ok) {
        const data = await response.json();
        setTransitions(data.allowedTransitions || []);
      }
    } catch (error) {
      console.error('Failed to fetch transitions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      fetchTransitions();
    }
    setIsOpen(!isOpen);
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    setIsOpen(false);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        onStatusChange();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="secondary"
        onClick={handleToggle}
        disabled={isUpdating}
        className="gap-2"
      >
        <Badge variant={statusVariants[currentStatus] || 'default'}>
          {currentStatusLabel}
        </Badge>
        {isUpdating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-primary-200 rounded-lg shadow-lg z-50">
          {isLoading ? (
            <div className="p-3 text-center text-sm text-primary-500">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
              Yükleniyor...
            </div>
          ) : transitions.length === 0 ? (
            <div className="p-3 text-center text-sm text-primary-500">
              Geçiş yok
            </div>
          ) : (
            <div className="py-1">
              {transitions.map((transition) => (
                <button
                  key={transition.value}
                  onClick={() => handleStatusChange(transition.value)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 flex items-center gap-2"
                >
                  <Badge variant={statusVariants[transition.value] || 'default'}>
                    {transition.label}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
