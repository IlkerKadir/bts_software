'use client';

import { useState, useEffect, useCallback } from 'react';
import { Eye, Users, Lock, Globe, Check } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

interface VisibilityUser {
  id: string;
  fullName: string;
  username: string;
}

interface Props {
  projectId: string;
}

type VisibilityMode = 'CREATOR_ONLY' | 'SPECIFIC_USERS' | 'EVERYONE';

const VISIBILITY_OPTIONS: { value: VisibilityMode; label: string; description: string; icon: typeof Lock }[] = [
  { value: 'CREATOR_ONLY', label: 'Sadece Oluşturan', description: 'Yalnızca teklifi oluşturan ve yöneticiler görebilir', icon: Lock },
  { value: 'SPECIFIC_USERS', label: 'Belirli Kullanıcılar', description: 'Seçilen kullanıcılar ve yöneticiler görebilir', icon: Users },
  { value: 'EVERYONE', label: 'Herkes', description: 'Tüm kullanıcılar görebilir', icon: Globe },
];

export function ProjectVisibility({ projectId }: Props) {
  const [isManager, setIsManager] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [visibility, setVisibility] = useState<VisibilityMode>('CREATOR_ONLY');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [currentUsers, setCurrentUsers] = useState<VisibilityUser[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; fullName: string; username: string }[]>([]);

  // Check if user is a manager and load visibility data
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // Check session
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) return;
        const meData = await meRes.json();
        const role = meData.user?.role;
        if (!role?.canApprove && !role?.canManageUsers) {
          setIsManager(false);
          setIsLoading(false);
          return;
        }
        setIsManager(true);

        // Fetch visibility settings and all users in parallel
        const [visRes, usersRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/visibility`),
          fetch('/api/users?isActive=true'),
        ]);

        if (visRes.ok) {
          const visData = await visRes.json();
          setVisibility(visData.visibility);
          setCurrentUsers(visData.users || []);
          setSelectedUserIds(new Set((visData.users || []).map((u: VisibilityUser) => u.id)));
        }

        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setAllUsers((usersData.users || []).map((u: any) => ({
            id: u.id,
            fullName: u.fullName,
            username: u.username,
          })));
        }
      } catch {
        setError('Görünürlük ayarları yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [projectId]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility,
          userIds: visibility === 'SPECIFIC_USERS' ? Array.from(selectedUserIds) : [],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Kaydetme hatası');
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setIsSaving(false);
    }
  }, [projectId, visibility, selectedUserIds]);

  const toggleUser = useCallback((userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  // Non-managers don't see this section
  if (!isManager && !isLoading) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center gap-2">
          <Check className="w-4 h-4" />
          Görünürlük ayarları kaydedildi
        </div>
      )}

      {/* Visibility mode selection */}
      <div className="grid gap-2">
        {VISIBILITY_OPTIONS.map(opt => {
          const Icon = opt.icon;
          const isActive = visibility === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVisibility(opt.value)}
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors cursor-pointer',
                isActive
                  ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-500'
                  : 'border-primary-200 hover:border-primary-300 hover:bg-primary-50'
              )}
            >
              <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', isActive ? 'text-accent-600' : 'text-primary-400')} />
              <div>
                <p className={cn('text-sm font-medium', isActive ? 'text-accent-900' : 'text-primary-700')}>
                  {opt.label}
                </p>
                <p className="text-xs text-primary-500 mt-0.5">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* User selection for SPECIFIC_USERS */}
      {visibility === 'SPECIFIC_USERS' && (
        <div className="border border-primary-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-primary-500 uppercase tracking-wider">
            Erişim Verilecek Kullanıcılar
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {allUsers.map(user => (
              <label
                key={user.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors',
                  selectedUserIds.has(user.id) ? 'bg-accent-50' : 'hover:bg-primary-50'
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="rounded border-primary-300 text-accent-600 focus:ring-accent-500"
                />
                <span className="text-sm text-primary-800">{user.fullName}</span>
                <span className="text-xs text-primary-400">@{user.username}</span>
              </label>
            ))}
          </div>
          {allUsers.length === 0 && (
            <p className="text-xs text-primary-400 text-center py-2">Kullanıcı bulunamadı</p>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={isSaving}
        >
          Kaydet
        </Button>
      </div>
    </div>
  );
}
