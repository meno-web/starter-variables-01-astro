import { defineCollection, z } from 'astro:content';
import { menoCmsLoader, resolveCmsEntrySlug } from 'meno-astro';

const blog = defineCollection({
  // Loads published items (<id>.json). In dev (astro dev / localhost / Meno play)
  // it ALSO merges draft sidecars (<id>.draft.json) over their published sibling so
  // you preview unpublished edits; a production astro build ships published only.
  // Item ids are the filename stem (the Meno CMS item key); the schema transform
  // below applies to drafts too. See meno-astro's menoCmsLoader.
  loader: menoCmsLoader({ base: './src/content/blog' }),
  // Resolves an i18n slug value to its default-locale string so the template's
  // getStaticPaths gets a valid route param; localized URLs are served by the
  // injected locale route. See meno-astro's resolveCmsEntrySlug.
  schema: z.record(z.string(), z.any()).transform((data) => resolveCmsEntrySlug(data, 'blog')),
});

export const collections = { blog };
