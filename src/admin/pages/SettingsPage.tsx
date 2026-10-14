/** Site settings — the single settings row (spec 02 AD-40). */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { FormProvider, useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { siteSettingsRow } from '../../data/schemas';
import { droppedFiles, removeIfUnused } from '../data/files';
import { useSettings, useUpdateSettings } from '../data/hooks';
import { MarkdownField } from '../fields/MarkdownField';
import { FieldGroup, ImageField, PdfField } from '../fields/media';
import { SelectField, SwitchField, TextField, UrlField } from '../fields/basic';
import fieldStyles from '../fields/fields.module.css';
import { flattenErrors } from '../managers/FormPage';
import formStyles from '../managers/form.module.css';
import { playbackOptions } from '../managers/options';
import { MediaSessionProvider, useMediaSession } from '../media/MediaSession';
import { useRepository } from '../repository';
import { isRepoError } from '../repository/errors';
import type { SettingsRow, Values } from '../repository/types';
import { PageBody, PageHeader } from '../shell/PageHeader';
import { useIsDirty } from '../shell/useIsDirty';
import { useUnsavedChanges } from '../shell/useUnsavedChanges';
import { useToast } from '../ui/feedback';
import { Button, Notice, Skeleton, ui } from '../ui/primitives';

const schema = siteSettingsRow.omit({ id: true, updated_at: true });

const toValues = (row: SettingsRow): Values => {
  const { id: _id, updated_at: _u, ...rest } = row;
  return { ...rest, socials: rest.socials ?? {}, seo: rest.seo ?? {} };
};

function SettingsEditor({ row }: { row: SettingsRow }) {
  const repo = useRepository();
  const toast = useToast();
  const media = useMediaSession();
  const update = useUpdateSettings();
  const [saved, setSaved] = useState(row);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  const defaults = useMemo(() => toValues(row), [row]);
  const form = useForm<Values>({
    defaultValues: defaults,
    resolver: zodResolver(schema as never) as unknown as Resolver<Values>,
    mode: 'onTouched',
    // focus goes to the error summary instead (spec 02 §3.9)
    shouldFocusError: false,
  });
  const [baseline, setBaseline] = useState<Values>(defaults);
  const dirty = useIsDirty(form.control, baseline);
  useUnsavedChanges(dirty && !update.isPending);

  const save = async (values: Values, force = false) => {
    if (media.uploading > 0) {
      toast.error('Wait for the upload to finish, then save.');
      return;
    }
    setErrors([]);
    try {
      const result = await update.mutateAsync({ values, expectedUpdatedAt: force ? null : saved.updated_at });
      void removeIfUnused(repo, droppedFiles(saved, result));
      media.commit();
      setSaved(result);
      setConflict(false);
      form.reset(toValues(result));
      setBaseline(toValues(result));
      toast.success('Settings saved.');
    } catch (e) {
      if (isRepoError(e) && e.kind === 'conflict') setConflict(true);
      else toast.error(isRepoError(e) ? e.message : 'Could not save.');
    }
  };
  const onInvalid = (errs: FieldErrors) => setErrors(flattenErrors(errs));

  return (
    <FormProvider {...form}>
      <PageBody>
        {conflict && (
          <Notice
            tone="warn"
            action={
              <span className={formStyles.conflictActions}>
                <Button
                  size="small"
                  onClick={async () => {
                    const fresh = await repo.data.getSettings();
                    setSaved(fresh);
                    form.reset(toValues(fresh));
                    setBaseline(toValues(fresh));
                    setConflict(false);
                  }}
                >
                  Reload
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  onClick={form.handleSubmit((v) => save(v, true), onInvalid)}
                >
                  Overwrite anyway
                </Button>
              </span>
            }
          >
            Settings were changed somewhere else since you opened this page.
          </Notice>
        )}
        {errors.length > 0 && (
          <Notice tone="error">
            Fix {errors.length === 1 ? 'this' : 'these'} before saving:{' '}
            {errors.map((e) => e.message).join('; ')}
          </Notice>
        )}
        <form className={formStyles.form} onSubmit={form.handleSubmit((v) => save(v), onInvalid)} noValidate>
          <FieldGroup title="Identity">
            <TextField name="display_name" label="Display name" required max={80} />
            <TextField
              name="tagline"
              label="Tagline"
              max={160}
              help="One line under your name in the opening scene."
            />
            <div className={fieldStyles.twoCol}>
              <TextField name="location" label="Location" max={80} />
              <TextField
                name="public_email"
                label="Public email"
                type="email"
                nullable
                help="Shown on the site. Leave empty to hide."
              />
            </div>
            <SwitchField
              name="available_for_work"
              label="Available for work"
              help="Shows a badge on the site."
            />
          </FieldGroup>

          <FieldGroup title="About">
            <TextField
              name="bio_short"
              label="Short bio"
              max={300}
              multiline
              rows={3}
              help="Two or three sentences for the About chapter."
            />
            <MarkdownField name="bio_long" label="Full bio" max={5000} rows={10} />
            <ImageField name="portrait" label="Portrait" />
          </FieldGroup>

          <FieldGroup title="Resume">
            <PdfField
              name="resume_path"
              label="Resume (PDF)"
              help="Recruiters reach it in one click from the Fast Lane."
            />
          </FieldGroup>

          <FieldGroup title="Social links">
            <div className={fieldStyles.twoCol}>
              <UrlField name="socials.github" label="GitHub" />
              <UrlField name="socials.linkedin" label="LinkedIn" />
              <UrlField name="socials.youtube" label="YouTube" />
              <UrlField name="socials.instagram" label="Instagram" />
              <UrlField name="socials.x" label="X (Twitter)" />
            </div>
          </FieldGroup>

          <FieldGroup title="Opening scene">
            <SelectField name="hero_playback" label="Hero clip playback" options={playbackOptions} />
          </FieldGroup>

          <FieldGroup
            title="Search & sharing"
            description="How the site appears on Google and when shared on WhatsApp, LinkedIn, etc."
          >
            <TextField name="seo.title" label="Page title" max={70} nullable />
            <TextField name="seo.description" label="Description" max={160} nullable multiline rows={2} />
            <ImageField name="seo.og_image" label="Share image" help="1200 × 630 px works best." />
          </FieldGroup>

          <div className={formStyles.saveBar}>
            <span className={ui.help}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
            <div className={formStyles.saveActions}>
              <Button type="submit" variant="primary" busy={update.isPending || media.uploading > 0}>
                {media.uploading > 0 ? 'Waiting for upload…' : 'Save settings'}
              </Button>
            </div>
          </div>
        </form>
      </PageBody>
    </FormProvider>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader
        title="Site settings"
        description="Your name, bio, links and how the site appears when shared."
      />
      {settings.isPending ? (
        <PageBody>
          <Skeleton height="20rem" />
        </PageBody>
      ) : settings.data ? (
        <MediaSessionProvider folder="settings">
          <SettingsEditor row={settings.data} />
        </MediaSessionProvider>
      ) : (
        <PageBody>
          <Notice tone="error">
            {isRepoError(settings.error) ? settings.error.message : "Couldn't load settings."}
          </Notice>
        </PageBody>
      )}
    </>
  );
}
