import type { APIRoute } from "astro";
import { getPortfolioData } from "../lib/github";
import { packages } from "../data/packages";
import { skillGroups } from "../data/skills";
import { workHistory, education, certificates } from "../data/history";

export const GET: APIRoute = () => {
  const { profile, projects } = getPortfolioData();

  const lines: string[] = [];

  // Header
  lines.push(`# ${profile.name} — Portfolio`);
  lines.push(`GitHub: ${profile.html_url}`);
  lines.push(`Site: https://akinozgen.com`);
  lines.push(``);
  lines.push(`Professionally works on backends, service integrations, and database-heavy systems — mostly in the ISP and networking space. Recent side projects lean lower-level and native: console homebrew, cross-platform apps, and small desktop tools.`);
  lines.push(``);

  // Work History
  lines.push(`## Work History`);
  lines.push(``);
  for (const job of workHistory) {
    lines.push(`### ${job.company}${job.current ? " *(current)*" : ""}`);
    lines.push(`**${job.role}** — ${job.period}`);
    lines.push(``);
    lines.push(job.description);
    if (job.url) lines.push(``);
    if (job.url) lines.push(`URL: ${job.url}`);
    lines.push(``);
  }

  // Education
  lines.push(`## Education`);
  lines.push(``);
  for (const e of education) {
    lines.push(`- **${e.institution}** — ${e.field} (${e.period})`);
  }
  lines.push(``);

  // Certificates
  lines.push(`## Certificates`);
  lines.push(``);
  for (const cert of certificates) {
    lines.push(`- ${cert.name} — \`${cert.id}\``);
  }
  lines.push(``);

  // Projects
  lines.push(`## Projects`);
  lines.push(``);
  for (const p of projects) {
    lines.push(`### ${p.name}${p.featured ? " *(actively developed)*" : ""}`);
    lines.push(`${p.subtitle}`);
    lines.push(``);
    lines.push(p.description);
    lines.push(``);
    lines.push(`- Language: ${p.language}`);
    lines.push(`- Stars: ${p.stars}`);
    if (p.topics.length > 0) lines.push(`- Topics: ${p.topics.join(", ")}`);
    lines.push(`- GitHub: ${p.githubUrl}`);
    if (p.homepageUrl) lines.push(`- Live: ${p.homepageUrl}`);
    lines.push(``);
  }

  // Packages
  lines.push(`## npm Packages`);
  lines.push(``);
  for (const pkg of packages) {
    lines.push(`### ${pkg.name} (v${pkg.version})`);
    lines.push(pkg.description);
    lines.push(``);
    lines.push(`- Language: ${pkg.language}`);
    lines.push(`- All-time downloads: ${pkg.totalDownloads.toLocaleString()}`);
    lines.push(`- npm: ${pkg.npmUrl}`);
    lines.push(`- GitHub: ${pkg.githubUrl}`);
    lines.push(``);
  }

  // Skills
  lines.push(`## Skills`);
  lines.push(``);
  for (const group of skillGroups) {
    lines.push(`### ${group.category}`);
    lines.push(group.skills.join(", "));
    lines.push(``);
  }

  // Contact
  lines.push(`## Contact`);
  lines.push(``);
  lines.push(`- Email (Proton): akinozgen@protonmail.com`);
  lines.push(`- Email (Outlook): akinozgen17@outlook.com`);
  lines.push(`- LinkedIn: https://www.linkedin.com/in/akinozgen/`);
  lines.push(``);

  const body = lines.join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
