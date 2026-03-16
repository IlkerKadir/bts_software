import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <div className="mb-4">
            <span className="text-6xl font-bold text-primary-300">404</span>
          </div>

          <h1 className="text-xl font-semibold text-primary-900 mb-2">
            Sayfa Bulunamadi
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Aradiginiz sayfa mevcut degil veya tasindi.
          </p>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            Ana Sayfaya Don
          </Link>
        </div>
      </div>
    </div>
  );
}
