/**
 * The home page (spec 03 HP-1 – HP-4): every chapter in order. Opening Scene (Part 4),
 * The System (Part 5), About, Credits, Timeline, Reviews and custom sections (Part 6);
 * Final Scene (contact) from Part 7.
 */
import { useSiteSettings } from '../data/queries/public';
import { StageProvider } from '../scene/stage/StageProvider';
import { Chapter } from '../shell/Chapter';
import { useHomeChapters } from '../shell/ChapterRegistry';
import { useDocumentTitle } from '../shell/hooks';
import { HeroChapter } from './hero/HeroChapter';
import { SystemChapter } from './system/SystemChapter';
import { AboutChapter } from './about/AboutChapter';
import { CreditsChapter } from './credits/CreditsChapter';
import { CustomSectionChapter } from './custom/CustomSectionChapter';
import { ContactChapter } from './contact/ContactChapter';
import { ReviewsChapter } from './reviews/ReviewsChapter';
import { TimelineChapter } from './timeline/TimelineChapter';

const bodies = {
  about: AboutChapter,
  projects: SystemChapter,
  credits: CreditsChapter,
  timeline: TimelineChapter,
  reviews: ReviewsChapter,
  contact: ContactChapter,
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
              <CustomSectionChapter section={entry.section} />
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
