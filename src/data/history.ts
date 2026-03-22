export interface WorkEntry {
  company: string;
  role: string;
  period: string;
  url?: string;
  description: string;
  current?: boolean;
}

export interface EducationEntry {
  institution: string;
  field: string;
  period: string;
}

export interface Certificate {
  name: string;
  id: string;
}

export const workHistory: WorkEntry[] = [
  {
    company: "İnoTürk",
    role: "Frontend Development Intern",
    period: "Summer 2016",
    url: "https://www.comu.edu.tr/duyuru-12942.html",
    description:
      "Where it all started. Jumped into a real codebase while still in university, shipped actual interfaces to actual users, and realized this is exactly what I want to do for a living. Most interns observe — I committed code.",
  },
  {
    company: "Infusion Ltd.",
    role: "Fullstack Developer",
    period: "Jun 2017 – Oct 2018",
    url: "https://infusion.com.tr",
    description:
      "First professional role straight out of university. Owned features end-to-end: Laravel backends, JavaScript frontends, REST APIs, database schemas. Learned what it means to write code that someone else has to maintain at 2am — and started writing it better because of that.",
  },
  {
    company: "Quart Bilişim",
    role: "Fullstack Developer · Systems · Networking",
    period: "Oct 2018 – May 2025",
    url: "https://issmanager.com",
    description:
      "Nearly seven years building ISS Manager — an ISP management platform — from an early product into something that runs real subscriber infrastructure. Wrote the billing engine, the FreeRADIUS AAA integrations, the hotspot and PPPoE systems, the MikroTik RouterOS automation layer, and the network monitoring stack. Somewhere along the way the job title stopped meaning much and the scope just kept growing. By the end I was as much an infrastructure engineer as a developer.",
  },
  {
    company: "ISSKONTROL ARGE / Quart Bilişim",
    role: "Fullstack · Systems · Mobile · Big Data",
    period: "May 2025 – present",
    url: "https://isskontrol.com.tr",
    description:
      "R&D work that spans mobile apps, smart POS hardware, and data pipelines processing traffic at a scale where minutes matter. The kind of role where the problem space keeps shifting and you have to keep up. Most challenging work of my career — and the most fun.",
    current: true,
  },
];

export const education: EducationEntry[] = [
  {
    institution: "Biga Anadolu Teknik Lisesi",
    field: "Technical High School",
    period: "2013 – 2015",
  },
  {
    institution: "Çanakkale Onsekiz Mart Üniversitesi",
    field: "Bilgisayar Programcılığı — Meslek Yüksekokulu",
    period: "2015 – 2017",
  },
];

export const certificates: Certificate[] = [
  { name: "Siber Güvenlik Uzmanlığı", id: "46COGSGFP5YY" },
  { name: "Siber Suçlar Uzmanlığı", id: "P40D7V0VT61Y" },
  { name: "Etik / Beyaz Şapkalı Hacker Uzmanlığı", id: "BA0T6MA41MV7" },
  { name: "Sızma Testi (Penetration Testing) Uzmanlığı", id: "KGHHFPO8UIE2" },
];
