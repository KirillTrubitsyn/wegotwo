/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // UI и server-side валидатор `uploadPhotoAction` оба разрешают
      // фото до 30 МБ, и UI прямо обещает «до 30 МБ». Дефолтный
      // bodySizeLimit Next (1 МБ) или старые 12 МБ молча резали
      // тяжёлые HEIC до того, как наша валидация успевала вернуть
      // нормальную ошибку. Выравниваем по реальному UI-лимиту.
      bodySizeLimit: "30mb",
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
