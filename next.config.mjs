/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
      {
        protocol: "https", 
        hostname: "fal.media",
      },
      {
        protocol: "https",
        hostname: "hebbkx1anhila5yf.public.blob.vercel-storage.com",
      },
    ],
    // Enable Next.js image optimization for faster loading
    // Images will be resized and compressed for the UI
    // Original HD images are still sent to the AI model via characterImageUrl
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 256],
    qualities: [60, 75],
  },
}

export default nextConfig
