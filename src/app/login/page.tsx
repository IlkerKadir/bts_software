import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getSession } from '@/lib/session';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const user = await getSession();

  if (user) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/btslogo.png"
            alt="BTS Yangın Güvenlik"
            width={200}
            height={80}
            style={{ width: 200, height: 'auto' }}
          />
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-primary-900 mb-1 text-center">
            Giriş Yap
          </h2>
          <p className="text-sm text-primary-400 text-center mb-6">
            Teklif Yönetim Sistemi
          </p>
          <Suspense fallback={<div>Yükleniyor...</div>}>
            <LoginForm />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="text-center text-primary-400 text-xs mt-6">
          &copy; 2026 BTS Yangın Güvenlik Yapı Teknolojileri Ltd. Şti.
        </p>
      </div>
    </div>
  );
}
