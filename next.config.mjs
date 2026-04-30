/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // UI и server-side валидатор `uploadPhotoAction` оба разрешают
      // фото до 30 МБ. Реальный body server action — это multipart
      // FormData с границами, заголовками и сериализованными аргументами,
      // так что суммарный размер запроса для файла на 30 МБ слегка
      // превышает 30 МБ. Закладываем небольшой запас (32 МБ), чтобы
      // граничные HEIC рядом с лимитом не упирались в bodySizeLimit
      // раньше нашей собственной валидации.
      bodySizeLimit: "32mb",
    },
  },
  outputFileTracingIncludes: {
    "/api/admin/seed/europe-2026": [
      "./src/seed/europe-2026/photos/**/*",
    ],
    "/api/admin/seed/common-docs": [
      "./src/seed/common-docs/**/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
