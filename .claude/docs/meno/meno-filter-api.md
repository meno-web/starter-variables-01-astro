## MenoFilter JavaScript API

For advanced use cases, MenoFilter exposes a JavaScript API for programmatic control.

### Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| \`$eq\` | Equal | \`{ status: { $eq: 'active' } }\` |
| \`$neq\` | Not equal | \`{ status: { $neq: 'draft' } }\` |
| \`$gt\` | Greater than | \`{ price: { $gt: 100 } }\` |
| \`$gte\` | Greater than or equal | \`{ price: { $gte: 100 } }\` |
| \`$lt\` | Less than | \`{ price: { $lt: 500 } }\` |
| \`$lte\` | Less than or equal | \`{ price: { $lte: 500 } }\` |
| \`$contains\` | String contains (case-insensitive) | \`{ title: { $contains: 'react' } }\` |
| \`$notContains\` | String does not contain | \`{ title: { $notContains: 'draft' } }\` |
| \`$startsWith\` | String starts with | \`{ slug: { $startsWith: 'how-to-' } }\` |
| \`$endsWith\` | String ends with | \`{ filename: { $endsWith: '.webp' } }\` |
| \`$in\` | Value in array | \`{ category: { $in: ['tech', 'design'] } }\` |
| \`$nin\` | Value not in array | \`{ category: { $nin: ['draft'] } }\` |
| \`$empty\` | Is empty/null | \`{ description: { $empty: true } }\` |

### Getting an Instance

\`\`\`javascript
// Get instance by collection name
const filter = MenoFilter.get('posts');
\`\`\`

### Filtering

\`\`\`javascript
// Simple filter
filter.filter({ category: 'tech' });

// Multiple conditions
filter.filter({ price: { $gt: 100, $lte: 500 } });

// Add/remove individual filters
filter.addFilter('status', 'published');
filter.removeFilter('status');
filter.clearFilters();

// Range filters
filter.filterRange('price', { min: 100, max: 500 });
\`\`\`

### Search

\`\`\`javascript
// Search across default fields
filter.search('react');

// Search specific fields
filter.search('react', ['title', 'description']);

// Clear search
filter.clearSearch();
\`\`\`

### Sort

\`\`\`javascript
// Sort by field
filter.sort('title', 'asc');
filter.sort('views', 'desc');

// Clear sort
filter.clearSort();
\`\`\`

### Pagination

\`\`\`javascript
// Navigate pages
filter.setPage(2);
filter.nextPage();
filter.prevPage();

// Change items per page
filter.setPerPage(12);

// Get page info
filter.getPageInfo(); // { current, total, hasNext, hasPrev }
\`\`\`

### Load More

\`\`\`javascript
// Load more items
filter.loadMore();

// Get load more info
filter.getLoadMoreInfo(); // { visible, total, remaining, hasMore }
\`\`\`

### Data Access

\`\`\`javascript
// Get items
filter.getAll();       // All items (unfiltered)
filter.getFiltered();  // Filtered items (before pagination)
filter.getItems();     // Current page items
\`\`\`

### Events

\`\`\`javascript
// Listen for filter changes
filter.on('afterFilter', (items) => {
  console.log('Filtered items:', items.length);
});

// Listen for page changes
filter.on('pageChange', (pageInfo) => {
  console.log('Current page:', pageInfo.current);
});
\`\`\`

### Reset

\`\`\`javascript
// Reset all (filters, search, sort, pagination)
filter.reset();
\`\`\`