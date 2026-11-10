require("dotenv").config();
const express = require("express");
const { addonBuilder, getRouter } = require("stremio-addon-sdk");

const API_KEY = process.env.TMDB_API_KEY;
const PORT = Number(process.env.PORT || 7000);
if (!API_KEY) {
  console.error("TMDB_API_KEY belum disetel. Set environment variable dari .env.example.");
  process.exit(1);
}

const catalogDefs = [
  { id: "id-popular", name: "Film Indonesia • Populer", kind: "popular" },
  { id: "id-trending", name: "Film Indonesia • Trending Hari Ini", kind: "trending" },
  { id: "id-now-playing", name: "Film Indonesia • Sedang Tayang", kind: "now_playing" },
  { id: "id-upcoming", name: "Film Indonesia • Segera Tayang", kind: "upcoming" },
  { id: "id-top-rated", name: "Film Indonesia • Rating Terbaik", kind: "top_rated" },
  ...["Action","Adventure","Animation","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Music","Mystery","Romance","Science Fiction","Thriller","War"].map(g => ({
    id: "id-genre-" + g.toLowerCase().replace(/[^a-z0-9]+/g,"-"), name: "Film Indonesia • " + g, kind: "genre", genre: g
  }))
];

const manifest = {
  id: "org.katalogfilm.indonesia.tmdb",
  version: "1.0.0",
  name: "Katalog Film Indonesia (TMDB)",
  description: "Katalog film Indonesia: populer, trending, genre, tayang, upcoming dan rating terbaik. Metadata bersumber dari TMDB.",
  resources: ["catalog", "meta"],
  types: ["movie"],
  catalogs: catalogDefs.map(c => ({
    type: "movie", id: c.id, name: c.name,
    extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }]
  }))
};

const builder = new addonBuilder(manifest);
const apiCache = new Map();
const TTL_MS = 5 * 60 * 1000;

async function tmdb(path, params = {}) {
  const url = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("language", "id-ID");
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v)); });
  const key = url.toString();
  const cached = apiCache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`TMDB ${response.status}: ${(await response.text()).slice(0,250)}`);
  const data = await response.json();
  apiCache.set(key, { at: Date.now(), data });
  return data;
}

function indonesiaOnly(results) {
  return (results || []).filter(m => (m.origin_country || m.production_countries?.map(c => c.iso_3166_1) || []).includes("ID"));
}

function toMeta(m) {
  return {
    id: `tmdb:${m.id}`, type: "movie",
    name: m.title || m.original_title || "Tanpa judul",
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
    background: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : undefined,
    description: m.overview || "Sinopsis belum tersedia.",
    releaseInfo: (m.release_date || "").slice(0,4),
    imdbRating: m.vote_average ? m.vote_average.toFixed(1) : undefined,
    genres: m.genre_ids || undefined,
    behaviorHints: { defaultVideoId: `tmdb:${m.id}` }
  };
}

builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
  if (type !== "movie") return { metas: [] };
  const def = catalogDefs.find(c => c.id === id);
  if (!def) return { metas: [] };
  const page = Math.max(1, Math.min(500, Math.floor(Number(extra.skip || 0) / 20) + 1));
  let endpoint, params = { page, region: "ID", with_origin_country: "ID" };
  if (extra.search) {
    endpoint = "/search/movie"; params = { page, query: extra.search, region: "ID" };
  } else if (def.kind === "trending") {
    endpoint = "/trending/movie/day"; params = { page };
  } else if (def.kind === "popular") {
    endpoint = "/discover/movie"; params = { ...params, sort_by: "popularity.desc" };
  } else if (def.kind === "now_playing") {
    endpoint = "/movie/now_playing"; params = { page, region: "ID" };
  } else if (def.kind === "upcoming") {
    endpoint = "/movie/upcoming"; params = { page, region: "ID" };
  } else if (def.kind === "top_rated") {
    endpoint = "/discover/movie"; params = { ...params, sort_by: "vote_average.desc", "vote_count.gte": 20 };
  } else if (def.kind === "genre") {
    const genres = await tmdb("/genre/movie/list");
    const found = genres.genres.find(g => g.name.toLowerCase() === def.genre.toLowerCase());
    if (!found) return { metas: [] };
    endpoint = "/discover/movie"; params = { ...params, with_genres: found.id, sort_by: "popularity.desc" };
  }
  const result = await tmdb(endpoint, params);
  let films = result.results || [];
  if (def.kind === "trending" || extra.search || def.kind === "now_playing" || def.kind === "upcoming") films = indonesiaOnly(films);
  return { metas: films.slice(0, 20).map(toMeta) };
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== "movie" || !id.startsWith("tmdb:")) return { meta: null };
  const m = await tmdb(`/movie/${encodeURIComponent(id.slice(5))}`, { append_to_response: "credits" });
  return { meta: {
    ...toMeta(m),
    genres: (m.genres || []).map(g => g.name),
    director: (m.credits?.crew || []).filter(p => p.job === "Director").map(p => p.name),
    cast: (m.credits?.cast || []).slice(0,10).map(p => p.name),
    runtime: m.runtime,
    videos: []
  }};
});

const app = express();
app.set("trust proxy", 1);
app.use((req,res,next) => { res.setHeader("Access-Control-Allow-Origin","*"); res.setHeader("Access-Control-Allow-Headers","*"); next(); });
app.get("/", (req,res) => {
  const fs = require("fs");
  const html = fs.readFileSync(require("path").join(__dirname,"public","index.html"),"utf8");
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  res.type("html").send(html.replaceAll("__PUBLIC_URL__", base));
});
app.get("/health", (req,res) => res.json({ status:"ok", service:"Katalog Film Indonesia TMDB", uptime:process.uptime() }));
app.use("/", getRouter(builder.getInterface()));
app.listen(PORT, "0.0.0.0", () => console.log(`Addon and website listening on port ${PORT}`));
