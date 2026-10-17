/** A custom section on the home page (spec 06 CS-3): its items in its layout, up to 6. */
import { usePublishedCustomSections } from '../../data/queries/public';
import type { CustomSection } from '../../data/schemas';
import { CustomSectionView } from './CustomSection';

export function CustomSectionChapter({ section }: { section: CustomSection }) {
  const q = usePublishedCustomSections();
  const items = q.data?.find((s) => s.section.id === section.id)?.items ?? [];
  if (q.isError) return <p>This chapter couldn&rsquo;t load right now.</p>;
  return <CustomSectionView section={section} items={items} variant="home" />;
}
