/** The seven built-in managers (spec 02 AD-41 – AD-46). */
import { useCallback, useId, useRef, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import {
  achievementInsert,
  experienceInsert,
  heroMediaInsert,
  projectInsert,
  skillInsert,
  testimonialInsert,
  type ImageRef,
} from '../../data/schemas';
import {
  DateField,
  GlobeField,
  ListField,
  NumberField,
  ScaleField,
  SelectField,
  SlugField,
  SwitchField,
  TextField,
  UrlField,
} from '../fields/basic';
import { MarkdownField } from '../fields/MarkdownField';
import { FieldGroup, ImageField, ImageListField, VideoField } from '../fields/media';
import { TagsField } from '../fields/TagsField';
import { captureFrame } from '../media/pipeline';
import { useAdminList } from '../data/hooks';
import { FieldShell } from '../ui/FieldShell';
import { Switch, ui } from '../ui/primitives';
import fieldStyles from '../fields/fields.module.css';
import {
  achievementKindOptions,
  categoryOptions,
  employmentOptions,
  heroSourceOptions,
  labelOf,
  themeOptions,
} from './options';
import { copySlug, toFormValues, type FormProps, type ManagerConfig } from './types';
import { useSkillCategories, useTechSuggestions } from './useSuggestions';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const img = (v: unknown) => (v && typeof v === 'object' && 'path' in v ? (v as ImageRef) : null);

function Visibility({ what }: { what: string }) {
  return (
    <FieldGroup title="Visibility">
      <SwitchField
        name="is_published"
        label="Published"
        help={`Only published ${what} appear on the site.`}
      />
    </FieldGroup>
  );
}

/* ------------------------------------------------------------------ */
/* Hero media                                                          */
/* ------------------------------------------------------------------ */

function HeroForm() {
  const video = useRef<HTMLVideoElement | null>(null);
  const source = useWatch({ name: 'source_type' }) as string;
  const mp4 = useWatch({ name: 'video_mp4' }) as string;
  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
  }, []);
  const canCapture = source === 'upload' && !!mp4;

  return (
    <>
      <Visibility what="clips" />
      <FieldGroup title="Clip">
        <TextField
          name="title"
          label="Title"
          required
          max={100}
          help="Also used as the accessible description of the clip."
        />
        <SelectField name="source_type" label="Source" required options={heroSourceOptions} />
        <VideoField
          name="video_mp4"
          label="Video (MP4)"
          required
          sourceField="source_type"
          accept="video/mp4"
          videoRef={setVideo}
        />
        <SelectField name="theme" label="Show in" options={themeOptions} />
      </FieldGroup>
      <FieldGroup
        title="Poster"
        description="Shown while the video loads, on slow connections and with reduced motion."
      >
        <ImageField
          name="poster"
          label="Poster image"
          required
          capture={
            canCapture
              ? {
                  label: 'Capture from video',
                  run: () => {
                    if (!video.current) throw new Error('No video');
                    return captureFrame(video.current);
                  },
                }
              : undefined
          }
          help={canCapture ? 'Pause the video on the frame you want, then capture it.' : undefined}
        />
      </FieldGroup>
      <FieldGroup
        title="Optional versions"
        description="Smaller or alternative files the browser can choose instead."
      >
        <VideoField name="video_webm" label="WebM version" sourceField="source_type" accept="video/webm" />
        <VideoField
          name="video_mobile"
          label="Phone version (smaller MP4)"
          sourceField="source_type"
          accept="video/mp4"
        />
      </FieldGroup>
    </>
  );
}

export const heroConfig: ManagerConfig = {
  table: 'hero_media',
  path: 'hero',
  singular: 'clip',
  plural: 'Hero media',
  description: 'Clips for the opening scene. Playback mode (single, sequence, random) is in Site settings.',
  emptyText: 'Add a drone shot or any short clip — it plays behind your name on the opening scene.',
  mediaFolder: 'hero',
  schema: heroMediaInsert,
  newValues: () => ({
    title: '',
    source_type: 'upload',
    video_mp4: '',
    video_webm: null,
    video_mobile: null,
    poster: null,
    theme: 'both',
    is_published: false,
  }),
  title: (r) => str(r.title) || 'Untitled clip',
  subtitle: (r) =>
    `${r.source_type === 'url' ? 'External link' : 'Uploaded'} · ${labelOf(themeOptions, r.theme)}`,
  image: (r) => img(r.poster),
  duplicate: (r) => ({ ...toFormValues(r), title: `${str(r.title)} (copy)`.slice(0, 100) }),
  Form: HeroForm,
};

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

function ProjectForm({ row }: FormProps) {
  const suggestions = useTechSuggestions();
  return (
    <>
      <Visibility what="projects" />
      <FieldGroup title="Basics">
        <TextField name="title" label="Title" required max={100} />
        <SlugField
          name="slug"
          label="Web address"
          from="title"
          auto={!row}
          publishedValue={row?.is_published ? str(row.slug) : null}
          prefix="/projects/"
        />
        <TextField
          name="summary"
          label="Summary"
          required
          max={280}
          multiline
          rows={3}
          help="One or two sentences for the project card."
        />
        <div className={fieldStyles.twoCol}>
          <SelectField name="category" label="Category" options={categoryOptions} />
          <NumberField name="year" label="Year" min={2000} max={2100} step={1} />
          <TextField name="role" label="Your role" max={100} placeholder="e.g. Backend lead" />
          <TextField name="client" label="Client" max={100} nullable />
        </div>
      </FieldGroup>
      <FieldGroup title="Images">
        <ImageField
          name="cover"
          label="Cover image"
          help="Shown on the project card and at the top of the project page."
        />
        <ImageListField name="gallery" label="Gallery" />
      </FieldGroup>
      <FieldGroup title="Case study">
        <MarkdownField name="body" label="Full story" max={20000} rows={14} />
      </FieldGroup>
      <FieldGroup title="Tech & links">
        <TagsField name="tech" label="Tech" suggestions={suggestions} />
        <div className={fieldStyles.twoCol}>
          <UrlField name="links.live" label="Live site" />
          <UrlField name="links.repo" label="Code repository" />
          <UrlField name="links.case_study" label="Case study / article" />
          <UrlField name="links.video" label="Video" />
        </div>
      </FieldGroup>
      <FieldGroup title="On the globe">
        <SwitchField
          name="is_featured"
          label="Featured"
          help="Featured projects appear as larger nodes on the 3D globe."
        />
        <GlobeField name="globe" label="Position" />
      </FieldGroup>
    </>
  );
}

export const projectsConfig: ManagerConfig = {
  table: 'projects',
  path: 'projects',
  singular: 'project',
  plural: 'Projects',
  description: 'Your work, shown as glowing nodes on the 3D globe and as project pages.',
  emptyText: 'Add a project you’re proud of — a cover image and a one-line summary is enough to start.',
  mediaFolder: 'projects',
  schema: projectInsert,
  newValues: () => ({
    title: '',
    slug: '',
    summary: '',
    body: '',
    category: 'work',
    role: '',
    client: null,
    year: new Date().getFullYear(),
    cover: null,
    gallery: [],
    tech: [],
    links: {},
    is_featured: false,
    globe: null,
    is_published: false,
  }),
  title: (r) => str(r.title) || 'Untitled project',
  subtitle: (r) => [labelOf(categoryOptions, r.category), r.year].filter(Boolean).join(' · '),
  image: (r) => img(r.cover),
  duplicate: (r, all) => ({
    ...toFormValues(r),
    title: `${str(r.title)} (copy)`.slice(0, 100),
    slug: copySlug(
      str(r.slug),
      all.map((x) => str(x.slug)),
    ),
  }),
  Form: ProjectForm,
};

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

function AchievementForm() {
  return (
    <>
      <Visibility what="achievements" />
      <FieldGroup title="Achievement">
        <div className={fieldStyles.twoCol}>
          <SelectField name="kind" label="Kind" options={achievementKindOptions} />
          <DateField name="awarded_on" label="Date" />
        </div>
        <TextField name="title" label="Title" required max={150} />
        <TextField name="issuer" label="Issued by" max={120} nullable />
        <TextField name="description" label="Description" max={1000} multiline rows={4} />
        <UrlField
          name="link"
          label="Verification link"
          help="e.g. the credential page on Credly or Microsoft Learn."
        />
        <SwitchField name="is_highlighted" label="Highlight" help="Shown larger in the Credits Roll." />
      </FieldGroup>
      <FieldGroup title="Image">
        <ImageField name="image" label="Badge or certificate" />
      </FieldGroup>
    </>
  );
}

export const achievementsConfig: ManagerConfig = {
  table: 'achievements',
  path: 'achievements',
  singular: 'achievement',
  plural: 'Achievements',
  description: 'Titles, awards and certifications — the Credits Roll.',
  emptyText: 'Add a certification, award or title you’ve earned.',
  mediaFolder: 'achievements',
  schema: achievementInsert,
  newValues: () => ({
    title: '',
    kind: 'certification',
    issuer: null,
    awarded_on: null,
    description: '',
    image: null,
    link: null,
    is_highlighted: false,
    is_published: false,
  }),
  title: (r) => str(r.title) || 'Untitled achievement',
  subtitle: (r) =>
    [labelOf(achievementKindOptions, r.kind), str(r.issuer), str(r.awarded_on).slice(0, 4)]
      .filter(Boolean)
      .join(' · '),
  image: (r) => img(r.image),
  duplicate: (r) => ({ ...toFormValues(r), title: `${str(r.title)} (copy)`.slice(0, 150) }),
  Form: AchievementForm,
};

/* ------------------------------------------------------------------ */
/* Experience                                                          */
/* ------------------------------------------------------------------ */

function EndDateField() {
  const { setValue } = useFormContext();
  const { field } = useController({ name: 'end_date' });
  const [current, setCurrent] = useState(field.value == null);
  const id = useId();
  return (
    <div className={ui.field}>
      <Switch
        id={id}
        checked={current}
        label="I currently work here"
        onChange={(v) => {
          setCurrent(v);
          setValue('end_date', v ? null : new Date().toISOString().slice(0, 10), {
            shouldDirty: true,
            shouldValidate: true,
          });
        }}
      />
      {!current && <DateField name="end_date" label="End date" required />}
    </div>
  );
}

function ExperienceForm() {
  const suggestions = useTechSuggestions();
  return (
    <>
      <Visibility what="roles" />
      <FieldGroup title="Role">
        <div className={fieldStyles.twoCol}>
          <TextField name="role" label="Role" required max={120} />
          <TextField name="company" label="Company" required max={120} />
          <SelectField name="employment_type" label="Type" options={employmentOptions} />
          <TextField name="location" label="Location" max={80} />
        </div>
        <div className={fieldStyles.twoCol}>
          <DateField name="start_date" label="Start date" required />
          <EndDateField />
        </div>
      </FieldGroup>
      <FieldGroup title="What you did">
        <MarkdownField name="description" label="Description" max={2000} rows={6} />
        <ListField
          name="highlights"
          label="Highlights"
          max={200}
          maxItems={10}
          help="Short achievements, one per line. Up to 10."
        />
        <TagsField name="tech" label="Tech" suggestions={suggestions} />
      </FieldGroup>
      <FieldGroup title="Logo">
        <ImageField name="logo" label="Company logo" />
      </FieldGroup>
    </>
  );
}

const yearOf = (d: unknown) => str(d).slice(0, 4);

export const experienceConfig: ManagerConfig = {
  table: 'experience',
  path: 'experience',
  singular: 'role',
  plural: 'Experience',
  description: 'Your work history, shown as a film-strip timeline.',
  emptyText: 'Add your current role first.',
  mediaFolder: 'experience',
  schema: experienceInsert,
  newValues: () => ({
    company: '',
    role: '',
    employment_type: 'full_time',
    location: '',
    start_date: '',
    end_date: null,
    description: '',
    highlights: [],
    tech: [],
    logo: null,
    is_published: false,
  }),
  title: (r) => [str(r.role), str(r.company)].filter(Boolean).join(' · ') || 'Untitled role',
  subtitle: (r) => `${yearOf(r.start_date)}–${r.end_date ? yearOf(r.end_date) : 'now'}`,
  image: (r) => img(r.logo),
  duplicate: (r) => ({ ...toFormValues(r), role: `${str(r.role)} (copy)`.slice(0, 120) }),
  Form: ExperienceForm,
};

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

function SkillForm() {
  const categories = useSkillCategories();
  const listId = useId();
  const { field } = useController({ name: 'category' });
  return (
    <>
      <Visibility what="skills" />
      <FieldGroup title="Skill">
        <TextField name="name" label="Name" required max={60} />
        <FieldShell label="Category" required help="Pick one or type your own.">
          {(a11y) => (
            <>
              <input
                {...a11y}
                ref={field.ref}
                className={ui.input}
                list={listId}
                value={str(field.value)}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
              />
              <datalist id={listId}>
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </FieldShell>
        <ScaleField name="level" label="Level" variant="dots" help="Optional. 1 = learning, 5 = expert." />
        <TextField name="icon" label="Icon" max={500} nullable help="Optional icon name or image path." />
        <SwitchField
          name="is_featured"
          label="Featured"
          help="Featured skills are larger in the skills constellation."
        />
      </FieldGroup>
    </>
  );
}

export const skillsConfig: ManagerConfig = {
  table: 'skills',
  path: 'skills',
  singular: 'skill',
  plural: 'Skills',
  description: 'Shown as an orbiting constellation in the Timeline chapter, grouped by category.',
  emptyText: 'Add the languages, tools and crafts you work with.',
  mediaFolder: 'skills',
  schema: skillInsert,
  newValues: () => ({
    name: '',
    category: 'Backend',
    level: null,
    icon: null,
    is_featured: false,
    is_published: false,
  }),
  title: (r) => str(r.name) || 'Untitled skill',
  subtitle: (r) => (r.level ? '●'.repeat(Number(r.level)) + '○'.repeat(5 - Number(r.level)) : ''),
  groupBy: (r) => str(r.category) || 'Other',
  duplicate: (r, all) => {
    const names = new Set(all.map((x) => str(x.name).toLowerCase()));
    let name = `${str(r.name)} (copy)`;
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${str(r.name)} (copy ${i})`;
    return { ...toFormValues(r), name: name.slice(0, 60) };
  },
  Form: SkillForm,
};

/* ------------------------------------------------------------------ */
/* Testimonials                                                        */
/* ------------------------------------------------------------------ */

function TestimonialForm() {
  const projects = useAdminList('projects');
  const options = (projects.data ?? []).map((p) => ({ value: p.id, label: str(p.title) }));
  return (
    <>
      <Visibility what="testimonials" />
      <FieldGroup title="Quote">
        <TextField name="quote" label="Quote" required max={600} multiline rows={5} />
        <ScaleField name="rating" label="Rating" variant="stars" help="Optional." />
      </FieldGroup>
      <FieldGroup title="Who said it">
        <div className={fieldStyles.twoCol}>
          <TextField name="author_name" label="Name" required max={80} />
          <TextField name="author_role" label="Role" max={80} />
          <TextField name="author_company" label="Company" max={80} />
          <UrlField name="source_url" label="Source link" help="e.g. the LinkedIn recommendation." />
        </div>
        <ImageField name="avatar" label="Photo" />
        <SelectField name="project_id" label="Related project" options={options} emptyLabel="None" />
      </FieldGroup>
    </>
  );
}

export const testimonialsConfig: ManagerConfig = {
  table: 'testimonials',
  path: 'testimonials',
  singular: 'testimonial',
  plural: 'Testimonials',
  description: 'Client and colleague quotes, styled like festival reviews.',
  emptyText: 'Add a quote from a client or colleague.',
  mediaFolder: 'testimonials',
  schema: testimonialInsert,
  newValues: () => ({
    quote: '',
    author_name: '',
    author_role: '',
    author_company: '',
    avatar: null,
    rating: null,
    source_url: null,
    project_id: null,
    is_published: false,
  }),
  title: (r) => str(r.author_name) || 'Untitled testimonial',
  subtitle: (r) => {
    const q = str(r.quote);
    return q.length > 70 ? `“${q.slice(0, 70)}…”` : `“${q}”`;
  },
  image: (r) => img(r.avatar),
  duplicate: (r) => ({ ...toFormValues(r), author_name: `${str(r.author_name)} (copy)`.slice(0, 80) }),
  Form: TestimonialForm,
};

export const builtInManagers = {
  hero: heroConfig,
  projects: projectsConfig,
  achievements: achievementsConfig,
  experience: experienceConfig,
  skills: skillsConfig,
  testimonials: testimonialsConfig,
} as const;
