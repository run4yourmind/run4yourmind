// Cloudflare Worker template for Run 4 Your Mind's daily resource feed.
//
// Deploy this as a Worker, then set this before the main page script:
// <script>window.RUN4YMIND_RESOURCE_FEED_URL = "https://YOUR-WORKER.your-subdomain.workers.dev";</script>
//
// The website will refresh this JSON once per day and merge it into the map.

const SOURCES = {
  forgottenHarvest: "https://www.forgottenharvest.org/find-food/",
  cityDetroit: "https://detroitmi.gov/departments/detroit-parks-recreation/recreation-centers/food-resources",
  foodHelpline: "https://www.foodhelpline.org/regions/detroit"
};

const KNOWN_COORDS = {
  "9435 hayes st": [42.4079, -82.9735],
  "11001 chalmers": [42.4153, -82.9588],
  "903 west grand blvd": [42.3667, -83.0912],
  "9000 woodward": [42.3828, -83.0791],
  "9555 st. mary": [42.3661, -83.2054],
  "18020 hoover": [42.4265, -83.0046],
  "4200 martin": [42.3293, -83.1356],
  "4800 woodward": [42.3558, -83.0669],
  "15879 seven mile": [42.4342, -82.9576],
  "11475 outer drive east": [42.4144, -82.9378],
  "10500 lyndon": [42.3987, -83.1618],
  "2260 s fort": [42.2779, -83.1387],
  "2301 woodmere": [42.3063, -83.1224],
  "18100 meyers": [42.4235, -83.1717]
};

function coordFor(address) {
  const normalized = address.toLowerCase();
  const match = Object.entries(KNOWN_COORDS).find(([needle]) => normalized.includes(needle));
  return match ? match[1] : [null, null];
}

function resourceId(prefix, name, address) {
  return `${prefix}-${name}-${address}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseForgottenHarvest(html) {
  const compact = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const pattern = /([A-Z][^()]{4,90})\s*\(([^)]+(?:Detroit|Ecorse|Warren|Southfield|Melvindale|Taylor|Inkster|Harper Woods)[^)]+)\)\s*[–-]\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]*(\d{1,2}:\d{2}\s*[AP]M)\s*[–-]\s*(\d{1,2}:\d{2}\s*[AP]M)/gi;
  const items = [];
  let match;

  while ((match = pattern.exec(compact)) && items.length < 40) {
    const name = match[1].trim();
    const address = match[2].trim();
    if (!/detroit/i.test(address)) continue;
    const [lat, lng] = coordFor(address);

    items.push({
      id: resourceId("fh-live", name, address),
      name,
      type: "drive",
      category: "Mobile pantry",
      schedule: `${match[3]}, ${match[4]}-${match[5]}`,
      address,
      neighborhood: "Detroit area",
      phone: "(248) 967-1500",
      source: "Forgotten Harvest live page",
      sourceUrl: SOURCES.forgottenHarvest,
      updated: new Date().toISOString().slice(0, 10),
      lat,
      lng,
      tags: ["Live schedule", "Mobile pantry", match[3]]
    });
  }

  return items;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Run4YourMindResourceBot/1.0 (+https://run4yourmind.org)"
    }
  });
  if (!response.ok) throw new Error(`Could not fetch ${url}`);
  return response.text();
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/daily-resource-feed/${new Date().toISOString().slice(0, 10)}`);
    const cached = await cache.match(cacheKey);

    if (cached && !url.searchParams.has("refresh")) {
      return cached;
    }

    const items = [];
    const errors = [];

    try {
      items.push(...parseForgottenHarvest(await fetchText(SOURCES.forgottenHarvest)));
    } catch (error) {
      errors.push(error.message);
    }

    const response = new Response(JSON.stringify(items, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=21600",
        "x-run4yourmind-source-errors": errors.join(" | ")
      }
    });

    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};
