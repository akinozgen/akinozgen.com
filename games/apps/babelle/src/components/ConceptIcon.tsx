import { concept } from "../game/data.ts";

/** A concept's Tabler icon. The markup comes from our own build, not from players. */
export function ConceptIcon({ id, className = "" }: { id: string; className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`concept-icon ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: concept(id).icon }}
    />
  );
}
