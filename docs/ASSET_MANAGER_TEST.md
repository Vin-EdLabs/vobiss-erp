# Asset Manager – Test Checklist

Use this checklist to verify the asset system is working end-to-end. Ensure the backend is running (`npm run dev` or `node server.js` in `backend/`) and you are logged in as a staff user (e.g. issuer, superadmin).

**First time:** If you get 500 errors or "relation … does not exist" for asset endpoints, restart the backend once so `initDB()` runs and creates the asset tables (`asset_categories`, `asset_locations`, `asset_vendors`, `asset_personnel`, `assets`, `asset_assignments`, `asset_maintenance`).

---

## 1. Setup (one-time)

- [ ] **Categories & Locations**  
  Go to **Assets → Categories** (or **Locations**). Add at least one category (e.g. "Laptops") and one location (e.g. "HQ").

- [ ] **Vendors**  
  Go to **Assets → Vendors → Add Vendor**. Create at least one vendor (name, type, contact optional).

- [ ] **People**  
  Go to **Assets → Assignments → Add Person**. Create at least one person (first name, last name required).

---

## 2. Assets

- [ ] **List**  
  **Assets → All Assets**. Page loads without error; table shows “No assets found” or existing assets. No console errors.

- [ ] **Add asset**  
  **Assets → Add New Asset**. Fill Step 1 (name, optional serial/brand/model), Step 2 (category, location), complete remaining steps, submit. Redirects to asset list and new asset appears.

- [ ] **Detail & edit**  
  Click an asset row. Detail page loads (photos, status, location, purchase info if set). Click **Edit Asset**, change name or status, **Save**. Changes persist after refresh.

---

## 3. Vendors

- [ ] **List**  
  **Assets → Vendors**. List loads; stats show correct counts.

- [ ] **Add vendor**  
  **Assets → Vendors → Add Vendor**. Submit with name and type. New vendor appears in list.

- [ ] **Vendor detail & edit**  
  Click a vendor. Detail loads. Edit name or contact, **Save**. Changes persist. **Delete** (if desired) removes vendor.

---

## 4. Assignments (assign & return)

- [ ] **People list**  
  **Assets → Assignments**. People load from API; “Assigned” count is 0 for new people.

- [ ] **Person detail**  
  Click a person. Detail page shows their info and “Currently Assigned Assets” (empty at first).

- [ ] **Assign asset**  
  On person detail, click **Assign New Asset**. Select an asset with status “available”, set condition and notes, click **Assign Asset**. Asset disappears from dropdown; it appears in “Currently Assigned Assets” table. Asset list (Assets → All Assets) shows that asset as “assigned” and “Assigned to” = that person.

- [ ] **Return asset**  
  On same person detail, click **Return** for the assigned asset. Set “Condition after return” and optional notes, **Confirm Return**. Asset disappears from “Currently Assigned”; on Assets list its status is “available” again.

- [ ] **History**  
  **Assets → Assignments**, then **View Assignment History**. Table shows assigned/returned events with date, person, asset, condition, notes.

---

## 5. Maintenance

- [ ] **List**  
  **Assets → Maintenance**. Records load (or “No records”).

- [ ] **Add maintenance**  
  **Assets → Maintenance → Log Maintenance**. Select an asset, type, description, optional technician/cost/dates, submit. New record appears in list.

- [ ] **Detail & edit**  
  Click a maintenance record. Detail page loads (asset link, type, description, status, timeline). Click **Update**, change status to “In Progress” or “Completed”, set completion date/cost/notes, **Save**. Changes persist.

---

## 6. Reports

- [ ] **Reports page**  
  **Assets → Reports**. Summary cards show: Total assets, Available, Assigned, In repair, Damaged, Lost/Retired, Maintenance pending/completed. “Recent Assignment History” table shows last 20 events.

- [ ] **Export**  
  Click **Export Assets CSV**. CSV downloads with asset columns. Click **Export History CSV**. CSV downloads with assignment history.

---

## 7. Quick API check (optional)

From project root, with backend running and a valid JWT in `Authorization: Bearer <token>`:

```bash
# List assets
curl -s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/assets | head -c 500

# List categories
curl -s -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/assets/categories
```

If you get JSON (or 401 without token), the backend routes are up.

---

## Troubleshooting

- **401 on asset pages**  
  Log in again; token may have expired.

- **Empty lists**  
  Create at least one category, one location, then add an asset. People and vendors can be created in any order.

- **“No available assets” when assigning**  
  Ensure at least one asset has status “available” (not assigned, not in_repair).

- **Backend not starting**  
  Ensure PostgreSQL is running and `.env` has correct `PG_*` and `JWT_SECRET`. Run migrations via app startup (tables are created in `initDB()`).
