/** The demo backend must follow the same rules as the database (spec 02 §3.3). */
import { describe, expect, it } from 'vitest';
import {
  createDemoRepository,
  createSignedInDemoRepository,
  demoCredentials,
} from '../../src/admin/repository/demoRepository';

describe('demo auth', () => {
  it('walks signed_out → needs_setup → signed_in → needs_code', async () => {
    const repo = createDemoRepository();
    expect((await repo.auth.getState()).status).toBe('signed_out');
    expect((await repo.auth.signIn(demoCredentials.email, 'x')).status).toBe('needs_setup');
    const setup = await repo.auth.startTotpSetup();
    await expect(repo.auth.finishTotpSetup(setup.factorId, '111111')).rejects.toThrow(/didn't match/);
    await repo.auth.finishTotpSetup(setup.factorId, demoCredentials.code);
    expect((await repo.auth.getState()).status).toBe('signed_in');
    await repo.auth.signOut('local');
    expect((await repo.auth.signIn(demoCredentials.email, 'x')).status).toBe('needs_code');
  });

  it('turns away other accounts and refuses data access without a session', async () => {
    const repo = createDemoRepository();
    expect((await repo.auth.signIn(demoCredentials.stranger, 'x')).status).toBe('not_owner');
    await expect(repo.data.list('projects')).rejects.toMatchObject({ kind: 'auth' });
  });

  it("won't remove the only authenticator", async () => {
    const repo = await createSignedInDemoRepository();
    const [only] = await repo.auth.listAuthenticators();
    await expect(repo.auth.removeAuthenticator(only!.id)).rejects.toThrow(/only authenticator/);
  });
});

describe('demo data rules', () => {
  it('rejects duplicate slugs and skill names (any case)', async () => {
    const repo = await createSignedInDemoRepository();
    await expect(
      repo.data.create('projects', { slug: 'drone-reel-2026', title: 'X', summary: 'X' }),
    ).rejects.toMatchObject({ kind: 'unique', field: 'slug' });
    await expect(repo.data.create('skills', { name: 'c#', category: 'X' })).rejects.toMatchObject({
      kind: 'unique',
    });
  });

  it('validates with the Part 1 schemas', async () => {
    const repo = await createSignedInDemoRepository();
    await expect(
      repo.data.create('projects', { slug: 'Bad Slug', title: 'X', summary: 'X' }),
    ).rejects.toMatchObject({
      kind: 'invalid',
      field: 'slug',
    });
  });

  it('detects edit conflicts via updated_at (AD-24)', async () => {
    const repo = await createSignedInDemoRepository();
    const [p] = await repo.data.list('projects');
    const first = await repo.data.update('projects', p!.id, { title: 'One' }, p!.updated_at);
    await expect(repo.data.update('projects', p!.id, { title: 'Two' }, p!.updated_at)).rejects.toMatchObject({
      kind: 'conflict',
    });
    await expect(
      repo.data.update('projects', p!.id, { title: 'Two' }, first.updated_at),
    ).resolves.toMatchObject({
      title: 'Two',
    });
    await expect(repo.data.update('projects', p!.id, { title: 'Three' }, null)).resolves.toMatchObject({
      title: 'Three',
    });
  });

  it('cascades: deleting a section deletes its items; deleting a project clears testimonial links', async () => {
    const repo = await createSignedInDemoRepository();
    const [section] = await repo.data.list('custom_sections');
    await repo.data.remove('custom_sections', section!.id);
    const left = await repo.data.list('custom_items');
    expect(left.length).toBeGreaterThan(0); // other sections keep theirs
    expect(left.filter((i) => i.section_id === section!.id)).toHaveLength(0);

    const [t] = await repo.data.list('testimonials');
    await repo.data.remove('projects', String(t!.project_id));
    expect((await repo.data.get('testimonials', t!.id))?.project_id).toBeNull();
  });

  it('reorders by id list', async () => {
    const repo = await createSignedInDemoRepository();
    const ids = (await repo.data.list('skills')).map((s) => s.id).reverse();
    await repo.data.reorder('skills', ids);
    expect((await repo.data.list('skills')).map((s) => s.id)).toEqual(ids);
  });

  it('applies bucket limits to uploads', async () => {
    const repo = await createSignedInDemoRepository();
    const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'image/png' });
    await expect(repo.files.upload('images', 'x/y.png', big, { contentType: 'image/png' })).rejects.toThrow(
      /limit is 5\.0 MB/,
    );
  });
});
