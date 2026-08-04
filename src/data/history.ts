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
      "Where it all started. Worked on a real codebase while still in university, shipped my first interfaces to real users, and figured out this is what I wanted to do for a living.",
  },
  {
    company: "Infusion Ltd.",
    role: "Fullstack Developer",
    period: "Jun 2017 – Oct 2018",
    url: "https://infusion.com.tr",
    description:
      "First professional role straight out of university. Worked on features end-to-end: Laravel backends, JavaScript frontends, REST APIs, database schemas. Learned a lot about writing code that other people have to maintain.",
  },
  {
    company: "Quart Bilişim",
    role: "Fullstack Developer · Systems · Networking",
    period: "Oct 2018 – May 2025",
    url: "https://issmanager.com",
    description:
      "Nearly seven years working on ISS Manager, an ISP management platform. Worked on the billing engine, FreeRADIUS AAA integrations, hotspot and PPPoE systems, MikroTik RouterOS automation, and network monitoring. Over time the scope grew from web work into systems and networking.",
  },
  {
    company: "ISSKONTROL ARGE / Quart Bilişim",
    role: "Fullstack · Systems · Mobile · Big Data",
    period: "May 2025 – present",
    url: "https://isskontrol.com.tr",
    description:
      "R&D work spanning mobile apps, smart POS hardware, and high-volume data pipelines. The problem space keeps shifting, which keeps it interesting.",
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
