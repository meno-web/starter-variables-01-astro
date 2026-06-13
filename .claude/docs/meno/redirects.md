## URL Redirects

Create \`_redirects\` file in project root for static hosting (Netlify, Cloudflare Pages).

**Format:** \`source  destination  status-code\`

**Examples:**
\`\`\`
/old-page    /new-page    301
/blog/*      /articles/:splat    302
/api/*       https://api.example.com/:splat    200
\`\`\`

- \`301\` = permanent redirect
- \`302\` = temporary redirect
- \`200\` = rewrite (URL doesn't change)

File is copied to build output automatically.