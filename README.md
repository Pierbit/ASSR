Albion Small Scale Reporter is a tool for Albion Online designed to create reports of the most relevant "Small scale" battles in a certain time window. 
This is the backend server for ASSR project. It acts as a proxy between the Albion Online public API and the frontend, providing filtered battle reports and additional data processing. 

Features:

- Fetches battles from the official Albion Online API
- Filters battles by:
  - Minimum and maximum participant count
  - Specific guild names or alliances
  - Time window (19-22 UTC)
- Groups guilds by alliance
- Calculates stats like total fame, kills, deaths, and kill/death ratio
- Provides structured and simplified endpoints for frontend use
- Automatically fetches and saves recent battles periodically

Technologies used:

- Node.js
- Express
- PostgreSQL
- Railway (for hosting)

Endpoints available:

- "GET https://assr-production.up.railway.app/api/battles/day?day=today" 
Returns all battles for today.
- "GET https://assr-production.up.railway.app/api/battles/day?day=yesterday"  
Returns all battles for yesterday.
- "GET https://assr-production.up.railway.app/api/battles/week"
Returns a cumulative battle report for all the guilds that have appeared in the last 2 weeks.

 
