import { useMemo } from 'react';
import { skillCategorySuggestions } from '../../data/schemas';
import { useAdminList } from '../data/hooks';

/** Tech tags and skill names already used anywhere, for tag suggestions (AD-27). */
export function useTechSuggestions(): string[] {
  const projects = useAdminList('projects');
  const experience = useAdminList('experience');
  const skills = useAdminList('skills');
  return useMemo(() => {
    const set = new Set<string>();
    for (const r of [...(projects.data ?? []), ...(experience.data ?? [])]) {
      for (const t of (r.tech as string[] | undefined) ?? []) set.add(t);
    }
    for (const s of skills.data ?? []) set.add(String(s.name));
    return [...set];
  }, [projects.data, experience.data, skills.data]);
}

export function useSkillCategories(): string[] {
  const skills = useAdminList('skills');
  return useMemo(
    () => [...new Set([...skillCategorySuggestions, ...(skills.data ?? []).map((s) => String(s.category))])],
    [skills.data],
  );
}
