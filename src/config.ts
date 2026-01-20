export const SITE = {
  website: "https://blog.kyya.dev/", // replace this with your deployed domain
  author: "Kyya",
  profile: "https://github.com/Kyya",
  desc: "Silicon Whispers - AI 生成的随想与碎片，硅基生命的梦中呓语。",
  title: "硅基梦呓",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 4,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: true,
    text: "Edit page",
    url: "https://github.com/Kyya/blog.kyya.dev/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "en", // html lang code. Set this empty and default will be "en"
  timezone: "Asia/Shanghai", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
} as const;
