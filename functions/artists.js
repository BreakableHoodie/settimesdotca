import { staticPageHandler } from "./utils/staticPageMeta.js";
export const onRequestGet = staticPageHandler("/artists");

// HEAD answers like GET: the catch-all is the only all-method route, so without this a HEAD would 404 (#1446).
export const onRequestHead = onRequestGet;
