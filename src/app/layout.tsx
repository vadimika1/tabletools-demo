import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './styles/global.css';
import './styles/overlay.css';
import './styles/dash.css';
import './styles/dash-charts.css';
import './styles/demo-shell.css';
import './styles/blocks-finance.css';
import './styles/blocks-insights.css';
import './styles/blocks-marketing.css';
import './styles/blocks-ops.css';
import './styles/blocks-crm.css';

// Переменный Onest (OFL, @fontsource-variable/onest 5.3.1), кириллица и латиница отдельными файлами: браузер качает только нужное.
const onest = localFont({
  src: [
    { path: '../assets/fonts/onest-cyrillic-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: '../assets/fonts/onest-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-onest',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: { default: 'Демо дашборда для владельца бизнеса — TableTools', template: '%s — демо TableTools' },
  description: 'Интерактивный дашборд для малого бизнеса с несколькими точками на синтетических данных: операционка, финансы, маркетинг, клиенты, CRM и сквозная аналитика.',
  formatDetection: { telephone: false },
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }] },
};

export const viewport: Viewport = { themeColor: '#0e1726', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={onest.variable}>
      <body>
        <a className="skip" href="#main">Перейти к содержанию</a>
        {children}
      </body>
    </html>
  );
}
