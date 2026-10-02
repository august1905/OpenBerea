import type { RadialMotion } from './motion';

// Native: the corner menus render at rest, without the web engine's animation (see engine.web.ts).
export function createMotion(): RadialMotion {
  return { sync() {}, selected() {}, dismissed() {}, destroy() {} };
}
