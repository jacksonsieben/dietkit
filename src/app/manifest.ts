import type { MetadataRoute } from "next";

import { messages } from "@/i18n/messages";
import { routing } from "@/i18n/routing";

/**
 * The web app manifest, served at `/manifest.webmanifest`.
 *
 * It sits at the root of `app/` rather than under `[locale]` because a manifest
 * is per-origin, not per-page: the browser fetches exactly one of them for the
 * whole installed app, outside any navigation. So the catalogue is read
 * directly instead of through `getTranslations` — there is no request here to
 * infer a locale from, and pretending otherwise only hides the choice this file
 * is actually making. Today that choice is the only locale there is
 * (docs/DECISIONS.md § D5); the day it isn't, this is where it gets decided.
 *
 * `id` is pinned so the identity of the installed app survives a change to
 * `start_url`; without it a moved start URL reads as a different app, and the
 * browser installs a second copy beside the first.
 */
export default function manifest(): MetadataRoute.Manifest {
  const locale = routing.defaultLocale;
  const t = messages[locale];

  return {
    id: "/",
    name: t.Manifest.name,
    short_name: t.Manifest.shortName,
    description: t.Metadata.description,
    lang: locale,
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["health", "fitness", "food"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Kept separate from the `any` icons on purpose: a launcher crops a
      // maskable icon to its own shape, so the mark in this one is drawn small
      // enough to survive the crop. Declaring one icon as both would mean
      // shipping a mark padded for a crop to every surface that doesn't crop.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
