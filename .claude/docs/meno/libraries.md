## External JavaScript Libraries

When adding external JS (GSAP, analytics, etc.), whitelist CDN domains in \`project.config.json\` for Content Security Policy.

\`\`\`json
{
  "libraries": {
    "js": [{ "url": "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" }]
  },
  "csp": {
    "scriptSrc": ["https://cdnjs.cloudflare.com"]
  }
}
\`\`\`

**CSP fields:** \`scriptSrc\`, \`styleSrc\`, \`fontSrc\`, \`connectSrc\`, \`frameSrc\`, \`imgSrc\`

**Common CDNs:**
- \`https://cdnjs.cloudflare.com\`
- \`https://unpkg.com\`
- \`https://cdn.jsdelivr.net\`

The \`_headers\` file is auto-generated from CSP config during build.