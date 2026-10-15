/**
 * Home page skeleton (spec 03 HP-1 – HP-4): every chapter in order, with simple, real
 * content until Parts 5–7 give each its cinematic version. The hero is the Opening Scene (Part 4).
 */
import { useSiteSettings } from '../data/queries/public';
import { StageProvider } from '../scene/stage/StageProvider';
import { Chapter } from '../shell/Chapter';
import { useHomeChapters } from '../shell/ChapterRegistry';
import { useDocumentTitle } from '../shell/hooks';
import { HeroChapter } from './hero/HeroChapter';
import { SystemChapter } from './system/SystemChapter';
import {
  AboutPlaceholder,
  ContactPlaceholder,
  CreditsPlaceholder,
  CustomSectionPlaceholder,
  ReviewsPlaceholder,
  TimelinePlaceholder,
} from './placeholders';

const bodies = {
  about: AboutPlaceholder,
  projects: SystemChapter,
  credits: CreditsPlaceholder,
  timeline: TimelinePlaceholder,
  reviews: ReviewsPlaceholder,
  contact: ContactPlaceholder,
} as const;

export function HomePage() {
  const { chapters } = useHomeChapters();
  const settings = useSiteSettings();
  useDocumentTitle(settings.isPending ? undefined : '');

  return (
    <StageProvider>
      {chapters.map((entry) => {
        if (entry.key === 'hero') {
          return (
            <Chapter key={entry.id} entry={entry} variant="hero">
              <HeroChapter headingId={`${entry.id}-title`} />
            </Chapter>
          );
        }
        if (entry.kind === 'custom' && entry.section) {
          return (
            <Chapter key={entry.id} entry={entry}>
              <CustomSectionPlaceholder section={entry.section} />
            </Chapter>
          );
        }
        const Body = bodies[entry.key as keyof typeof bodies];
        return (
          <Chapter key={entry.id} entry={entry}>
            <Body />
          </Chapter>
        );
      })}
    </StageProvider>
  );
}
