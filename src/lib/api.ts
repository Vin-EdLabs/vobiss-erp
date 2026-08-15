const BASE_URL = import.meta.env.VITE_API_URL;

export default BASE_URL;

/** REST API prefix — `{VITE_API_URL}/api` (trailing `/api` on the env value is stripped). */
export const API_URL = `${String(BASE_URL || '').replace(/\/$/, '').replace(/\/api$/i, '')}/api`;
