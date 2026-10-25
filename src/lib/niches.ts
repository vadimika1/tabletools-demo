// Отрасли демо: подписи для экрана выбора, меню отрасли и конструктора.
import type { IndustryKey } from './demo-app/engine/types.ts';

export const NICHES: Record<IndustryKey, string> = {
  clinic: 'Клиника или стоматология',
  salon: 'Салон или барбершоп',
  fitness: 'Фитнес или студия',
  auto: 'Автосервис или детейлинг',
  studio: 'Творческая студия или досуг',
  other: 'Другое',
};
