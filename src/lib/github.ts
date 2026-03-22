import projectsMetadata from "../data/projects.json";
import { snapshotProfile, snapshotProjects } from "../data/github-snapshot";
import type { CuratedProjectMetadata, Project } from "../types/project";

const curatedProjects = projectsMetadata as CuratedProjectMetadata[];

export function getPortfolioData() {
  const projects = curatedProjects.flatMap((metadata) => {
    const snapshot = snapshotProjects.find((p) => p.repoKey === metadata.repokey);
    if (!snapshot) return [];
    return [{
      ...snapshot,
      name: metadata.name,
      subtitle: metadata.subtitle,
      description: metadata.summary,
      images: metadata.images,
      featured: metadata.featured ?? false,
    }] satisfies Project[];
  });

  return {
    profile: snapshotProfile,
    projects,
  };
}
