import type { Option } from '../fields/basic';

export const categoryOptions: Option[] = [
  { value: 'work', label: 'Work' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'personal', label: 'Personal' },
];

export const achievementKindOptions: Option[] = [
  { value: 'award', label: 'Award' },
  { value: 'certification', label: 'Certification' },
  { value: 'title', label: 'Title' },
  { value: 'recognition', label: 'Recognition' },
  { value: 'publication', label: 'Publication' },
  { value: 'other', label: 'Other' },
];

export const employmentOptions: Option[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'internship', label: 'Internship' },
];

export const themeOptions: Option[] = [
  { value: 'both', label: 'Both themes' },
  { value: 'dark', label: 'Dark theme only' },
  { value: 'light', label: 'Light theme only' },
];

export const heroSourceOptions: Option[] = [
  { value: 'upload', label: 'Upload a file' },
  { value: 'url', label: 'Link to a file hosted elsewhere (https)' },
];

export const playbackOptions: Option[] = [
  { value: 'single', label: 'Single — always the first published clip' },
  { value: 'sequence', label: 'Sequence — cycle through all published clips' },
  { value: 'random', label: 'Random — one clip per visit' },
];

export const layoutOptions: Option[] = [
  { value: 'grid', label: 'Grid of cards' },
  { value: 'list', label: 'List' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'gallery', label: 'Image gallery' },
];

export const chapterOptions: Option[] = [
  { value: 'hero', label: 'Opening scene' },
  { value: 'about', label: 'About' },
  { value: 'projects', label: 'Projects' },
  { value: 'credits', label: 'Achievements (Credits Roll)' },
  { value: 'timeline', label: 'Experience (Timeline)' },
  { value: 'reviews', label: 'Testimonials (Reviews)' },
];

export const labelOf = (options: Option[], value: unknown) =>
  options.find((o) => o.value === value)?.label ?? String(value ?? '');
