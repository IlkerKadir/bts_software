'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';

interface ChartData {
  monthlyRevenue: { month: string; kazanilan: number; kaybedilen: number; bekleyen: number }[];
  winRate: { month: string; rate: number }[];
  pipeline: { name: string; value: number; color: string }[];
}

const PIPELINE_COLORS = {
  'Taslak': '#94A3B8',
  'Onay Bekliyor': '#F59E0B',
  'Onaylandı': '#0EA5E9',
  'Gönderildi': '#3B82F6',
  'Takipte': '#8B5CF6',
  'Kazanıldı': '#22C55E',
  'Kaybedildi': '#EF4444',
};

export function DashboardCharts() {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, []);

  async function fetchChartData() {
    try {
      const res = await fetch('/api/dashboard/charts');
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Chart data fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Revenue */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Aylik Gelir</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.monthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="month" fontSize={12} tick={{ fill: '#64748B' }} />
            <YAxis fontSize={12} tick={{ fill: '#64748B' }} tickFormatter={(v) => `\u20AC${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(value) => [`\u20AC${Number(value).toLocaleString('tr-TR')}`, '']} />
            <Legend />
            <Bar dataKey="kazanilan" name="Kazanilan" fill="#22C55E" radius={[4,4,0,0]} />
            <Bar dataKey="bekleyen" name="Bekleyen" fill="#F59E0B" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Win Rate Trend */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 mb-4">Kazanma Orani Trendi</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data.winRate}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="month" fontSize={12} tick={{ fill: '#64748B' }} />
            <YAxis fontSize={12} tick={{ fill: '#64748B' }} tickFormatter={(v) => `%${v}`} domain={[0, 100]} />
            <Tooltip formatter={(value) => [`%${Number(value).toFixed(1)}`, 'Kazanma Orani']} />
            <Line type="monotone" dataKey="rate" stroke="#0369A1" strokeWidth={2} dot={{ fill: '#0369A1', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pipeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 lg:col-span-2">
        <h3 className="font-semibold text-slate-900 mb-4">Teklif Pipeline</h3>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data.pipeline} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
              {data.pipeline.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
