import { DemoShell } from '@/components/demo-app/shell/DemoShell';

// Разделы демо: своё меню слева и верхняя панель с фильтрами. Экран выбора отрасли (/) живёт вне этой группы.
export default function DemoAppLayout({ children }: { children: React.ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
