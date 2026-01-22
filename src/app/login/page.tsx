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
          &copy; 2025 BTS Yangın Güvenlik Sistemleri
        </p>
      </div>
    </div>
  );
}
