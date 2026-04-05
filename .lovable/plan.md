## Engineer Route Planner

### 1. Database: Add `estimated_hours` to visits
- New nullable decimal column for manual job duration estimates

### 2. Edge Function: `plan-route`
- Accepts list of visit postcodes + office start postcode
- Uses Google Maps Distance Matrix API to get travel times
- Returns optimised route order with travel durations

### 3. New Page: Route Planner (`/dashboard/route-planner`)
- Select a date (or date range) to load open visits
- Show visits on an embedded Google Map with numbered pins
- Display optimised day plan: start → site 1 (travel time) → site 2 → etc.
- Show total travel time + total job time + estimated finish

### 4. Update Visit Form
- Add "Estimated Hours" field to the visit creation/edit dialog

### Notes
- Will use existing `GOOGLE_PLACES_API_KEY` (needs Maps JavaScript API + Distance Matrix API enabled on the same Google Cloud project)
- Single engineer focus — select which visits to include in the plan
