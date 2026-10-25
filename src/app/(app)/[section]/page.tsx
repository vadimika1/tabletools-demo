import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionAbout } from '@/components/demo-app/SectionAbout';
import { SectionView } from '@/components/demo-app/SectionView';
import { SECTIONS, SECTION_ORDER, sectionBySlug } from '@/lib/demo-app/blocks/registry';
import { SECTION_COPY } from '@/lib/demo-app/section-copy';

export const dynamicParams = false;
export function generateStaticParams() {
  return SECTION_ORDER.map((k) => ({ section: SECTIONS[k].slug }));
}

type Props = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const key = sectionBySlug((await params).section);
  if (!key) return {};
  return { title: SECTION_COPY[key].seoTitle, description: `${SECTIONS[key].hint}. Демо на вымышленных данных.` };
}

export default async function Page({ params }: Props) {
  const key = sectionBySlug((await params).section);
  if (!key) notFound();
  return (
    <>
      <SectionView section={key} />
      <SectionAbout section={key} />
    </>
  );
}
