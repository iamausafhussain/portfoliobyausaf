import type { IconName } from '../ui/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Show the number of new messages next to the label (spec 07 IB-1). */
  badge?: 'newMessages';
}

export const contentNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/admin/inbox', label: 'Inbox', icon: 'mail', badge: 'newMessages' },
  { to: '/admin/settings', label: 'Site settings', icon: 'user' },
  { to: '/admin/hero', label: 'Hero media', icon: 'film' },
  { to: '/admin/projects', label: 'Projects', icon: 'image' },
  { to: '/admin/achievements', label: 'Achievements', icon: 'star' },
  { to: '/admin/experience', label: 'Experience', icon: 'file' },
  { to: '/admin/skills', label: 'Skills', icon: 'sparkle' },
  { to: '/admin/testimonials', label: 'Testimonials', icon: 'copy' },
];

/** The shop (spec 08 §2.4), under its own heading. */
export const shopNav: NavItem[] = [
  { to: '/admin/products', label: 'Products', icon: 'ticket' },
  { to: '/admin/orders', label: 'Orders', icon: 'receipt' },
  { to: '/admin/discounts', label: 'Discount codes', icon: 'tag' },
  { to: '/admin/policies', label: 'Shop policies', icon: 'file' },
];

export const toolsNav: NavItem[] = [
  { to: '/admin/media', label: 'Media library', icon: 'upload' },
  { to: '/admin/account', label: 'Account', icon: 'user' },
];
