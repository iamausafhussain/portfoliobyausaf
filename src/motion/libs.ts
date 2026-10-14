/**
 * GSAP, ScrollTrigger and Lenis — loaded lazily after first paint (spec 03 SC-5),
 * so they never count against the initial download budget.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export { gsap, Lenis, ScrollTrigger };
