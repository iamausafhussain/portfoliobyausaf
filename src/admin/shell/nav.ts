import type { IconName } from '../ui/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

export const contentNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/admin/settings', label: 'Site settings', icon: 'user' },
  { to: '/admin/hero', label: 'Hero media', icon: 'film' },
  { to: '/admin/projects', label: 'Projects', icon: 'image' },
  { to: '/admin/achievements', label: 'Achievements', icon: 'star' },
  { to: '/admin/experience', label: 'Experience', icon: 'file' },
  { to: '/admin/skills', label: 'Skills', icon: 'sparkle' },
  { to: '/admin/testimonials', label: 'Testimonials', icon: 'copy' },
];

export const toolsNav: NavItem[] = [
  { to: '/admin/media', label: 'Media library', icon: 'upload' },
  { to: '/admin/account', label: 'Account', icon: 'user' },
];
