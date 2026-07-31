/**
 * Public API of the `portal` module.
 *
 * Other modules may only import from `@/modules/portal` — never from files
 * inside it. Deep cross-module imports are blocked by ESLint.
 */
export { getOrCreateToken, PortalMagicLinkButton } from "./components/PortalMagicLinkButton";
