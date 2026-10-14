/** Demo content for DemoRepository (dev only). Clearly fake; never shipped to production. */
import type { AdminTable, Row, SettingsRow } from './types';

const t0 = Date.parse('2026-10-01T09:00:00Z');
const ts = (minutes: number) => new Date(t0 + minutes * 60_000).toISOString();
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = (n: number, sort: number, published = true) => ({
  id: id(n),
  sort_order: sort,
  is_published: published,
  created_at: ts(n),
  updated_at: ts(n),
});

export const demoImages: { path: string; label: string; w: number; h: number }[] = [
  { path: 'images/projects/demo-edi.webp', label: 'EDI pipeline', w: 1600, h: 900 },
  { path: 'images/projects/demo-reel.webp', label: 'Drone reel', w: 1600, h: 900 },
  { path: 'images/projects/demo-dashboard.webp', label: 'Dashboard', w: 1600, h: 900 },
  { path: 'images/hero/demo-poster.webp', label: 'Hero poster', w: 1920, h: 1080 },
  { path: 'images/portrait/demo-portrait.webp', label: 'Portrait', w: 800, h: 1000 },
  { path: 'images/achievements/demo-badge.webp', label: 'Badge', w: 600, h: 600 },
  { path: 'images/talks/demo-stage.webp', label: 'On stage', w: 1200, h: 800 },
  { path: 'images/unused/demo-orphan.webp', label: 'Unused', w: 800, h: 600 },
];

export function demoSettings(): SettingsRow {
  return {
    id: 1,
    display_name: 'Ausaf Hussain',
    tagline: 'Full-stack developer and filmmaker',
    bio_short: 'I build data pipelines by day and shoot cinematic travel films by weekend.',
    bio_long: 'Demo biography. **Markdown** works here.',
    portrait: {
      path: 'images/portrait/demo-portrait.webp',
      alt: 'Portrait of Ausaf',
      width: 800,
      height: 1000,
    },
    location: 'Bhubaneswar, India',
    public_email: null,
    resume_path: null,
    socials: { github: 'https://github.com/iamausafhussain' },
    available_for_work: true,
    hero_playback: 'single',
    seo: {},
    updated_at: ts(0),
  };
}

export function demoRows(): Record<AdminTable, Row[]> {
  return {
    hero_media: [
      {
        ...base(101, 0),
        title: 'Demo drone reel',
        source_type: 'url',
        video_mp4: 'https://example.com/demo-reel.mp4',
        video_webm: null,
        video_mobile: null,
        poster: {
          path: 'images/hero/demo-poster.webp',
          alt: 'Aerial shot over green hills',
          width: 1920,
          height: 1080,
        },
        theme: 'both',
      },
    ],
    projects: [
      {
        ...base(201, 0),
        slug: 'supply-chain-edi-pipeline',
        title: 'Supply-chain EDI pipeline',
        summary: 'Parses X12 shipment notices at scale and routes them through Azure Service Bus.',
        body: '## The problem\nDemo case study text.',
        category: 'work',
        role: 'Backend developer',
        client: null,
        year: 2025,
        cover: {
          path: 'images/projects/demo-edi.webp',
          alt: 'Diagram of the EDI pipeline',
          width: 1600,
          height: 900,
        },
        gallery: [
          {
            path: 'images/projects/demo-dashboard.webp',
            alt: 'Monitoring dashboard',
            width: 1600,
            height: 900,
          },
        ],
        tech: ['C#', '.NET', 'Azure Service Bus', 'EDI X12'],
        links: {},
        is_featured: true,
        globe: null,
      },
      {
        ...base(202, 1),
        slug: 'drone-reel-2026',
        title: 'Drone reel 2026',
        summary: 'A cinematic travel reel shot across Odisha.',
        body: '',
        category: 'personal',
        role: 'Director, editor',
        client: null,
        year: 2026,
        cover: {
          path: 'images/projects/demo-reel.webp',
          alt: 'Still from the drone reel',
          width: 1600,
          height: 900,
        },
        gallery: [],
        tech: ['DaVinci Resolve', 'Drone'],
        links: {},
        is_featured: false,
        globe: { lat: 20.3, lng: 85.8 },
      },
      {
        ...base(203, 2, false),
        slug: 'freelance-dashboard',
        title: 'Freelance analytics dashboard',
        summary: 'Draft — a client dashboard built with React.',
        body: '',
        category: 'freelance',
        role: 'Full-stack developer',
        client: 'Demo client',
        year: 2026,
        cover: null,
        gallery: [],
        tech: ['React', 'TypeScript'],
        links: {},
        is_featured: false,
        globe: null,
      },
    ],
    achievements: [
      {
        ...base(301, 0),
        title: 'Demo certification',
        kind: 'certification',
        issuer: 'Demo issuer',
        awarded_on: '2026-03-01',
        description: 'Demo achievement.',
        image: {
          path: 'images/achievements/demo-badge.webp',
          alt: 'Certification badge',
          width: 600,
          height: 600,
        },
        link: null,
        is_highlighted: true,
      },
    ],
    experience: [
      {
        ...base(401, 0),
        company: 'Demo Company',
        role: 'Senior Officer, Full Stack .NET Developer',
        employment_type: 'full_time',
        location: 'Bhubaneswar',
        start_date: '2023-07-01',
        end_date: null,
        description: 'Demo description.',
        highlights: ['Built an EDI processing pipeline', 'Azure Functions ETL'],
        tech: ['C#', '.NET', 'Azure'],
        logo: null,
      },
    ],
    skills: [
      { ...base(501, 0), name: 'C#', category: 'Backend', level: 5, icon: null, is_featured: true },
      { ...base(502, 1), name: '.NET', category: 'Backend', level: 5, icon: null, is_featured: true },
      { ...base(503, 2), name: 'Azure', category: 'Cloud', level: 4, icon: null, is_featured: false },
      { ...base(504, 3), name: 'React', category: 'Frontend', level: 3, icon: null, is_featured: false },
      {
        ...base(505, 4, false),
        name: 'Blender',
        category: 'Creative',
        level: 2,
        icon: null,
        is_featured: false,
      },
    ],
    testimonials: [
      {
        ...base(601, 0),
        quote: 'Demo testimonial — delivered ahead of schedule.',
        author_name: 'Demo Client',
        author_role: 'Founder',
        author_company: 'Demo Co',
        avatar: null,
        rating: 5,
        source_url: null,
        project_id: id(201),
      },
    ],
    custom_sections: [
      {
        ...base(701, 0),
        name: 'Talks',
        slug: 'talks',
        intro: 'Talks and workshops.',
        layout: 'list',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'venue', label: 'Venue', type: 'text', required: false },
          { key: 'date', label: 'Date', type: 'date', required: false },
          {
            key: 'format',
            label: 'Format',
            type: 'select',
            required: true,
            options: ['Talk', 'Workshop', 'Podcast'],
          },
          { key: 'photo', label: 'Photo', type: 'image', required: false },
        ],
        insert_after: 'reviews',
        show_on_home: true,
        has_page: false,
        show_in_nav: false,
      },
    ],
    custom_items: [
      {
        ...base(801, 0),
        section_id: id(701),
        data: {
          title: 'Scaling EDI on Azure',
          venue: 'Demo meetup',
          date: '2026-05-01',
          format: 'Talk',
          photo: { path: 'images/talks/demo-stage.webp', alt: 'Speaking on stage', width: 1200, height: 800 },
          old_rating: 5,
        },
      },
    ],
  };
}

export const demoNewMessages = 2;
