// HZ CARS · API única (Netlify Functions v2 + Netlify Blobs)
// Rutas públicas:  GET /api/vehicles · GET /api/img/:id · POST /api/lead · POST /api/login
// Rutas admin (Bearer token): /api/admin/vehicles, /api/admin/images, /api/admin/leads
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/*" };

const ESTADOS = ["disponible", "reservado", "vendido", "oculto"];
const TIPOS = ["coche", "moto"];
const COMBUSTIBLES = ["Diésel", "Gasolina", "Híbrido", "Eléctrico", "GLP", "Otro"];
const CAMBIOS = ["Manual", "Automático"];
const MAX_FOTOS = 20;
const MAX_IMG_BYTES = 6 * 1024 * 1024;

const env = (k) => {
  try { if (typeof Netlify !== "undefined") return Netlify.env.get(k); } catch (_) {}
  return process.env[k];
};

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
const fail = (status, error) => json({ error }, status);

const vehicles = () => getStore({ name: "vehicles", consistency: "strong" });
const images = () => getStore({ name: "images", consistency: "strong" });
const security = () => getStore({ name: "security", consistency: "strong" });
const leads = () => getStore({ name: "leads", consistency: "strong" });

/* ---------- auth ---------- */
const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
const secret = () => (env("SESSION_SECRET") || "") + "|" + (env("ADMIN_PASSWORD") || "");
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let r = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return r === 0;
}
async function makeToken() {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 30);
  return exp + "." + (await hmac(secret(), exp));
}
async function isAdmin(req) {
  if (!env("ADMIN_PASSWORD")) return false;
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [exp, sig] = t.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secret(), exp));
}

/* ---------- helpers ---------- */
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const num = (v) => {
  const n = Number(String(v ?? "").replace(/[\s.]/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
const validId = (s) => /^[a-z0-9-]{6,40}$/.test(s || "");

function cleanVehicle(input, base = {}) {
  const v = { ...base };
  if ("tipo" in input) v.tipo = TIPOS.includes(input.tipo) ? input.tipo : "coche";
  if ("marca" in input) v.marca = str(input.marca, 40);
  if ("modelo" in input) v.modelo = str(input.modelo, 60);
  if ("version" in input) v.version = str(input.version, 80);
  if ("anio" in input) v.anio = num(input.anio);
  if ("km" in input) v.km = num(input.km);
  if ("combustible" in input) v.combustible = COMBUSTIBLES.includes(input.combustible) ? input.combustible : "";
  if ("cambio" in input) v.cambio = CAMBIOS.includes(input.cambio) ? input.cambio : "";
  if ("precio" in input) v.precio = num(input.precio);
  if ("descripcion" in input) v.descripcion = str(input.descripcion, 3000);
  if ("estado" in input) v.estado = ESTADOS.includes(input.estado) ? input.estado : "disponible";
  if ("destacado" in input) v.destacado = !!input.destacado;
  if ("etiqueta" in input) v.etiqueta = str(input.etiqueta, 24);
  if ("fotos" in input && Array.isArray(input.fotos))
    v.fotos = [...new Set(input.fotos.filter(validId))].slice(0, MAX_FOTOS);
  return v;
}

async function readAll(store) {
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}
const RANK = { disponible: 0, reservado: 1, vendido: 2, oculto: 3 };
const sortVehicles = (a, b) =>
  (RANK[a.estado] ?? 0) - (RANK[b.estado] ?? 0) ||
  (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) ||
  (b.createdAt || 0) - (a.createdAt || 0);

async function readBody(req) {
  try { return await req.json(); } catch (_) { return null; }
}

/* ---------- router ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const parts = path.split("/");
  const method = req.method;

  try {
    /* públicas */
    if (path === "vehicles" && method === "GET") {
      const list = (await readAll(vehicles())).filter((v) => v.estado !== "oculto").sort(sortVehicles);
      return json(list, 200, { "cache-control": "public, max-age=10" });
    }

    if (parts[0] === "img" && parts[1] && method === "GET") {
      if (!validId(parts[1])) return fail(404, "no encontrada");
      const r = await images().getWithMetadata(parts[1], { type: "arrayBuffer" });
      if (!r) return fail(404, "no encontrada");
      return new Response(r.data, {
        headers: {
          "content-type": r.metadata?.contentType || "image/jpeg",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (path === "login" && method === "POST") {
      const b = await readBody(req);
      if (!env("ADMIN_PASSWORD")) return fail(500, "Falta configurar ADMIN_PASSWORD en Netlify.");
      // límite de intentos por IP: 8 fallos en 15 minutos
      const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "x").split(",")[0].trim().replace(/[^a-zA-Z0-9.:]/g, "_").slice(0, 60);
      const rec = (await security().get("login-" + ip, { type: "json" })) || { n: 0, t: Date.now() };
      if (Date.now() - rec.t > 15 * 60 * 1000) { rec.n = 0; rec.t = Date.now(); }
      if (rec.n >= 8) return fail(429, "Demasiados intentos. Espera 15 minutos y vuelve a probar.");
      if (!b || !safeEqual(b.password || "", env("ADMIN_PASSWORD"))) {
        rec.n++;
        await security().setJSON("login-" + ip, rec);
        await new Promise((r) => setTimeout(r, 800));
        return fail(401, "Contraseña incorrecta");
      }
      if (rec.n) await security().delete("login-" + ip);
      return json({ token: await makeToken() });
    }

    if (path === "lead" && method === "POST") {
      const b = await readBody(req);
      if (!b || b.web) return json({ ok: true }); // honeypot
      const lead = {
        id: Date.now() + "-" + newId().slice(0, 6),
        tipo: b.tipo === "vender" ? "vender" : "contacto",
        nombre: str(b.nombre, 80),
        telefono: str(b.telefono, 40),
        mensaje: str(b.mensaje, 1500),
        vehiculo: str(b.vehiculo, 200),
        leido: false,
        createdAt: Date.now(),
      };
      if (!lead.nombre && !lead.telefono && !lead.mensaje) return fail(400, "vacío");
      await leads().setJSON(lead.id, lead);
      return json({ ok: true });
    }

    /* admin */
    if (parts[0] === "admin") {
      if (!(await isAdmin(req))) return fail(401, "No autorizado");

      if (parts[1] === "vehicles") {
        const id = parts[2];
        if (!id && method === "GET") return json((await readAll(vehicles())).sort(sortVehicles));
        if (!id && method === "POST") {
          const b = await readBody(req);
          if (!b) return fail(400, "datos no válidos");
          const now = Date.now();
          const v = cleanVehicle(
            { tipo: "coche", estado: "disponible", fotos: [], ...b },
            { id: newId(), createdAt: now, updatedAt: now }
          );
          if (!v.marca || !v.modelo) return fail(400, "Falta marca o modelo");
          await vehicles().setJSON(v.id, v);
          return json(v, 201);
        }
        if (id && validId(id) && method === "PUT") {
          const old = await vehicles().get(id, { type: "json" });
          if (!old) return fail(404, "no existe");
          const b = await readBody(req);
          if (!b) return fail(400, "datos no válidos");
          const v = cleanVehicle(b, old);
          v.updatedAt = Date.now();
          const removed = (old.fotos || []).filter((f) => !(v.fotos || []).includes(f));
          await vehicles().setJSON(id, v);
          await Promise.all(removed.map((f) => images().delete(f)));
          return json(v);
        }
        if (id && validId(id) && method === "DELETE") {
          const old = await vehicles().get(id, { type: "json" });
          if (old) await Promise.all((old.fotos || []).map((f) => images().delete(f)));
          await vehicles().delete(id);
          return json({ ok: true });
        }
      }

      if (parts[1] === "images" && !parts[2] && method === "POST") {
        const type = (req.headers.get("content-type") || "").split(";")[0];
        if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return fail(400, "Formato de imagen no válido");
        const buf = await req.arrayBuffer();
        if (!buf.byteLength) return fail(400, "imagen vacía");
        if (buf.byteLength > MAX_IMG_BYTES) return fail(413, "Imagen demasiado grande");
        const id = newId();
        await images().set(id, buf, { metadata: { contentType: type } });
        return json({ id }, 201);
      }

      if (parts[1] === "images" && validId(parts[2]) && method === "DELETE") {
        await images().delete(parts[2]);
        return json({ ok: true });
      }

      if (parts[1] === "leads") {
        const id = parts[2];
        if (!id && method === "GET") {
          const all = await readAll(leads());
          return json(all.sort((a, b) => b.createdAt - a.createdAt));
        }
        if (id && /^[0-9a-z-]{6,60}$/.test(id) && method === "PUT") {
          const l = await leads().get(id, { type: "json" });
          if (!l) return fail(404, "no existe");
          const b = (await readBody(req)) || {};
          if ("leido" in b) l.leido = !!b.leido;
          await leads().setJSON(id, l);
          return json(l);
        }
        if (id && /^[0-9a-z-]{6,60}$/.test(id) && method === "DELETE") {
          await leads().delete(id);
          return json({ ok: true });
        }
      }
    }

    return fail(404, "ruta no encontrada");
  } catch (e) {
    console.error(e);
    return fail(500, "Error del servidor");
  }
};
