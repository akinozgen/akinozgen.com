import type { GithubUser, Project } from "../types/project";

export const snapshotProfile: GithubUser = {
  login: "akinozgen",
  name: "Akin Ozgen",
  html_url: "https://github.com/akinozgen",
  avatar_url: "https://avatars.githubusercontent.com/u/9608963?v=4",
  bio: null
};

export const snapshotProjects: Project[] = [
  {
    repoKey: "akinozgen/navicloud",
    name: "NaviCloud",
    slug: "navicloud",
    subtitle: "Navidrome client for Android + Windows",
    description:
      "A music client for Navidrome / Subsonic servers, built with Kotlin Multiplatform and Compose. Runs on Android and Windows.",
    images: [],
    githubUrl: "https://github.com/akinozgen/navicloud",
    homepageUrl: null,
    language: "Kotlin",
    stars: 2,
    fork: false,
    archived: false,
    topics: ["navidrome", "subsonic", "kotlin-multiplatform", "compose"],
    updatedAt: "2026-07-19T16:11:01Z"
  },
  {
    repoKey: "akinozgen/fallout1-ce-ps3",
    name: "Fallout 1 CE — PS3",
    slug: "fallout1-ce-ps3",
    subtitle: "Fallout 1 running natively on PS3",
    description:
      "A native PlayStation 3 homebrew port of Fallout 1, built on Fallout Community Edition. Cross-compiled for the Cell PPU with an SDL2 backend.",
    images: [],
    githubUrl: "https://github.com/akinozgen/fallout1-ce-ps3",
    homepageUrl: null,
    language: "C",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["ps3-homebrew", "fallout", "sdl2", "psl1ght"],
    updatedAt: "2026-08-04T19:39:05Z"
  },
  {
    repoKey: "akinozgen/snip",
    name: "Snip",
    slug: "snip",
    subtitle: "Screenshot utility for Windows",
    description:
      "A small Rust utility for region screenshots that turn into floating, always-on-top reference windows. Also saves clipboard images as files on paste.",
    images: [],
    githubUrl: "https://github.com/akinozgen/snip",
    homepageUrl: null,
    language: "Rust",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["rust", "windows", "screenshot", "clipboard"],
    updatedAt: "2026-05-20T21:00:13Z"
  },
  {
    repoKey: "akinozgen/fo4-ae-save-rescuer",
    name: "Fallout 4 Save Rescuer",
    slug: "fo4-ae-save-rescuer",
    subtitle: "Fixes FO4 saves with missing mods",
    description:
      "A C# tool that repairs Fallout 4 saves that no longer load because their mods are gone, by rewriting the save so it stops depending on them.",
    images: [],
    githubUrl: "https://github.com/akinozgen/fo4-ae-save-rescuer",
    homepageUrl: null,
    language: "C#",
    stars: 0,
    fork: false,
    archived: true,
    topics: ["csharp", "fallout4", "save-editor", "modding"],
    updatedAt: "2026-07-27T18:17:37Z"
  },
  {
    repoKey: "akinozgen/fm",
    name: "FM - File Manager",
    slug: "fm",
    subtitle: "File manager in Tauri + Vue + Rust",
    description:
      "A cross-platform file manager built with Tauri, Vue, and Rust. Handles navigation, multi-select, inline rename, file ops, virtual locations, and per-directory view persistence. Actively developed.",
    images: [],
    githubUrl: "https://github.com/akinozgen/fm",
    homepageUrl: null,
    language: "Vue",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["tauri", "vue", "rust", "file-manager"],
    updatedAt: "2026-03-22T17:00:34Z"
  },
  {
    repoKey: "akinozgen/ps3dec-gui",
    name: "PS3Dec GUI",
    slug: "ps3dec-gui",
    subtitle: "PowerShell desktop utility",
    description:
      "A Windows GUI wrapped around PS3Dec, the command-line tool for decrypting PS3 game ISOs. If you don't want to deal with a terminal for this, here you go.",
    images: [],
    githubUrl: "https://github.com/akinozgen/ps3dec-gui",
    homepageUrl: null,
    language: "PowerShell",
    stars: 30,
    fork: false,
    archived: false,
    topics: ["powershell", "ps3", "rpcs3", "script"],
    updatedAt: "2026-03-05T07:54:31Z"
  },
  {
    repoKey: "akinozgen/ue5-number-station-generator",
    name: "UE5 Number Station Generator",
    slug: "ue5-number-station-generator",
    subtitle: "Unreal Engine audio experiment",
    description:
      "An UE5 plugin that generates number-station style audio — procedural, atmospheric, a bit eerie. Built mostly out of curiosity.",
    images: [],
    githubUrl: "https://github.com/akinozgen/ue5-number-station-generator",
    homepageUrl: null,
    language: "C++",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["C++", "Unreal Engine", "Audio"],
    updatedAt: "2026-03-17T17:14:44Z"
  },
  {
    repoKey: "akinozgen/react-youtube-mp3-player",
    name: "React YouTube MP3 Player",
    slug: "react-youtube-mp3-player",
    subtitle: "Media interface experiment",
    description:
      "An MP3 player interface built around YouTube rather than a local music library. Search, play, and queue straight from YouTube without touching the actual site.",
    images: [],
    githubUrl: "https://github.com/akinozgen/react-youtube-mp3-player",
    homepageUrl: "https://akinozgen.github.io/react-youtube-mp3-player/",
    language: "JavaScript",
    stars: 18,
    fork: false,
    archived: false,
    topics: ["react", "youtube", "mp3", "media"],
    updatedAt: "2024-08-08T03:56:56Z"
  },
  {
    repoKey: "akinozgen/react-multiwatch",
    name: "React Multiwatch",
    slug: "react-multiwatch",
    subtitle: "Synchronized multi-stream viewing",
    description:
      "Watch multiple YouTube streams in a resizable grid. Keyboard shortcuts let you rearrange the layout and control playback across all of them at the same time.",
    images: [],
    githubUrl: "https://github.com/akinozgen/react-multiwatch",
    homepageUrl: null,
    language: "TypeScript",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["React", "TypeScript", "Video"],
    updatedAt: "2024-09-19T13:42:56Z"
  },
  {
    repoKey: "akinozgen/subliminal-ui",
    name: "Subliminal UI",
    slug: "subliminal-ui",
    subtitle: "Desktop subtitle downloader",
    description:
      "A desktop GUI for the Subliminal subtitle library. Sits in the system tray, watches your media folders, and pulls subtitles automatically — no command line needed.",
    images: [],
    githubUrl: "https://github.com/akinozgen/subliminal-ui",
    homepageUrl: null,
    language: "Python",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["python", "subtitles", "desktop", "gui"],
    updatedAt: "2025-06-05T14:01:48Z"
  },
  {
    repoKey: "akinozgen/clipwatch",
    name: "Clipwatch",
    slug: "clipwatch",
    subtitle: "Clipboard image saver for Windows",
    description:
      "Watches your clipboard for images and saves them as files when you hit Ctrl+V in an Explorer window. Drops the image into whatever folder you have open, or the desktop if nothing's focused.",
    images: [],
    githubUrl: "https://github.com/akinozgen/clipwatch",
    homepageUrl: null,
    language: "C++",
    stars: 0,
    fork: false,
    archived: false,
    topics: ["cpp", "windows", "clipboard", "utility"],
    updatedAt: "2025-05-29T16:18:13Z"
  },
  {
    repoKey: "akinozgen/ytmp3-android",
    name: "YTMP3 Android",
    slug: "ytmp3-android",
    subtitle: "Mobile conversion utility",
    description:
      "An Android app for downloading YouTube audio as MP3. Ships with a yt-dlp based backend server — install it, point the app at it, and you're good.",
    images: [],
    githubUrl: "https://github.com/akinozgen/ytmp3-android",
    homepageUrl: null,
    language: "Dart",
    stars: 7,
    fork: false,
    archived: false,
    topics: ["Dart", "Android", "Utility"],
    updatedAt: "2023-11-17T10:28:11Z"
  },
  {
    repoKey: "akinozgen/genieacs-helper-php",
    name: "GenieACS Helper PHP",
    slug: "genieacs-helper-php",
    subtitle: "PHP helper tooling",
    description:
      "PHP helpers for working with GenieACS, the TR-069 ACS. Cuts down on the boilerplate when you're managing a lot of CPE devices.",
    images: [],
    githubUrl: "https://github.com/akinozgen/genieacs-helper-php",
    homepageUrl: null,
    language: "PHP",
    stars: 15,
    fork: false,
    archived: false,
    topics: ["genieacs", "php", "tr-069"],
    updatedAt: "2025-09-30T09:07:35Z"
  },
  {
    repoKey: "akinozgen/youtube-to-newsboat",
    name: "YouTube to Newsboat",
    slug: "youtube-to-newsboat",
    subtitle: "RSS and automation utility",
    description:
      "Turns YouTube channels into RSS feeds you can follow in Newsboat. Handy if you prefer keeping up with channels from the terminal.",
    images: [],
    githubUrl: "https://github.com/akinozgen/youtube-to-newsboat",
    homepageUrl: null,
    language: "Shell",
    stars: 4,
    fork: false,
    archived: false,
    topics: ["rss", "newsboat", "youtube", "shell"],
    updatedAt: "2025-06-13T19:38:10Z"
  },
  {
    repoKey: "akinozgen/toolbelt",
    name: "Toolbelt",
    slug: "toolbelt",
    subtitle: "Vue utility collection",
    description:
      "A collection of utilities I kept needing — encoder, markdown notepad, HTTP client, hasher, alarm clock, and a few others. Built for myself, open sourced in case it's useful to anyone else.",
    images: [],
    githubUrl: "https://github.com/akinozgen/toolbelt",
    homepageUrl: null,
    language: "Vue",
    stars: 6,
    fork: false,
    archived: false,
    topics: ["Vue"],
    updatedAt: "2026-03-16T16:37:32Z"
  }
];
