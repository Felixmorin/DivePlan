import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DivePlan",
    short_name: "DivePlan",
    description: "Planifie et consulte tes séances de plongeon.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#071b2d",
    theme_color: "#071b2d",
    icons: [
      { src: "/icons/diveplan-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/diveplan-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/diveplan-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/diveplan.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
    ]
  };
}
