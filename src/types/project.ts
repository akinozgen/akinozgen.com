export interface Project {
  repoKey: string;
  name: string;
  slug: string;
  subtitle: string;
  description: string;
  images: string[];
  featured?: boolean;
  githubUrl: string;
  homepageUrl: string | null;
  language: string | null;
  stars: number;
  fork: boolean;
  archived: boolean;
  topics: string[];
  updatedAt: string;
}

export interface GithubUser {
  login: string;
  name: string | null;
  html_url: string;
  avatar_url: string;
  bio: string | null;
}

export interface Package {
  name: string;
  description: string;
  version: string;
  language: string;
  totalDownloads: number;
  githubUrl: string;
  npmUrl: string;
}

export interface CuratedProjectMetadata {
  repokey: string;
  name: string;
  subtitle: string;
  summary: string;
  images: string[];
  featured?: boolean;
}
