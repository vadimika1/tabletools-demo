import type { Metadata } from 'next';
import { Builder } from '@/components/demo-app/Builder';

export const metadata: Metadata = {
  title: 'Соберите свой дашборд',
  description: 'Каталог блоков дашборда: операционка, финансы, маркетинг, клиенты, сквозная аналитика. Отметьте нужное и посмотрите на данных примера.',
};

export default function Page() {
  return <Builder />;
}
