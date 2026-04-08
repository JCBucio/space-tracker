const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

const TLE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const API_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

// TLE Cache: store data and timestamp
let tleCache = {
    data: null,
    timestamp: null,
};

const apiCache = {
    issInfo: { data: null, timestamp: null },
    cssInfo: { data: null, timestamp: null },
    expeditions: {},
};

const isCacheValid = () => {
    if (!tleCache.data || !tleCache.timestamp) return false;
    return Date.now() - tleCache.timestamp < TLE_CACHE_DURATION;
};

const isTimedCacheValid = (cacheEntry) => {
    if (!cacheEntry?.data || !cacheEntry?.timestamp) return false;
    return Date.now() - cacheEntry.timestamp < API_CACHE_DURATION;
};

const getCachedEntry = (cacheEntry) => (isTimedCacheValid(cacheEntry) ? cacheEntry.data : null);

const setCachedEntry = (cacheEntry, data) => {
    cacheEntry.data = data;
    cacheEntry.timestamp = Date.now();
};

// Endpoint to get and clean TLEs from Celestrak (cached once per day)
app.get('/api/tles', async (req, res) => {
    try {
        // Return cached data if still valid
        if (isCacheValid()) {
            console.log('Returning cached TLE data (age: ' + Math.floor((Date.now() - tleCache.timestamp) / 1000) + 's)');
            return res.json(tleCache.data);
        }

        const response = await fetch('https://celestrak.com/NORAD/elements/stations.txt');
        const data = await response.text();

        // CelesTrak sends plane text: Name, Line 1, Line 2
        const lines = data.split('\n').map(line => line.trim());
        const stations = [];

        for (let i = 0; i < lines.length; i += 3) {
            if (lines[i] && lines[i + 1] && lines[i + 2]) {
                stations.push({
                    name: lines[i],
                    tle1: lines[i + 1],
                    tle2: lines[i + 2]
                });
            }
        }

        // Filter only the Stations we are interested in (ISS and Tiangong)
        const activeMannedStations = stations.filter(s =>
            s.name.includes('ISS (ZARYA)') || s.name.includes('CSS (TIANHE)')
        );

        // Cache the data and timestamp
        tleCache.data = activeMannedStations;
        tleCache.timestamp = Date.now();

        console.log('Fetched and cleaned TLEs (cached for next 24 hours)');
        console.log(activeMannedStations);

        res.json(activeMannedStations);
    } catch (error) {
        console.error('Error fetching TLEs:', error);
        
        // If cache exists but fetch failed, return cached data as fallback
        if (tleCache.data) {
            console.log('Fetch failed, returning expired cache as fallback');
            return res.json(tleCache.data);
        }

        res.status(500).json({
            error: 'The orbital data could not be retrieved.'
        });
    }
});

// Endpoint to get the ISS information from The Space Devs API
app.get('/api/iss-info', async (req, res) => {
    try {
        const cachedIss = getCachedEntry(apiCache.issInfo);
        if (cachedIss) {
            console.log('Returning cached ISS info');
            return res.json(cachedIss);
        }

        const response = await fetch('https://ll.thespacedevs.com/2.3.0/space_stations/?id=4&mode=detailed&status=1');
        const data = await response.json();
        const issInfo = data['results'][0];

        setCachedEntry(apiCache.issInfo, issInfo);
        console.log('Fetched ISS crew data and cached for 2 hours:', issInfo);

        res.json(issInfo);
    } catch (error) {
        console.error('Error fetching ISS crew data:', error);

        if (apiCache.issInfo.data) {
            console.log('ISS fetch failed, returning cached data');
            return res.json(apiCache.issInfo.data);
        }

        res.status(500).json({
            error: 'The crew data could not be retrieved.'
        });
    }
});

// Endpoint to get CSS information from The Space Devs API
app.get('/api/css-info', async (req, res) => {
    try {
        const cachedCss = getCachedEntry(apiCache.cssInfo);
        if (cachedCss) {
            console.log('Returning cached CSS info');
            return res.json(cachedCss);
        }

        const response = await fetch('https://ll.thespacedevs.com/2.3.0/space_stations/?id=18&mode=detailed&status=1');
        const data = await response.json();
        const cssInfo = data['results'][0];

        setCachedEntry(apiCache.cssInfo, cssInfo);
        console.log('Fetched CSS crew data and cached for 2 hours:', cssInfo);

        res.json(cssInfo);
    } catch (error) {
        console.error('Error fetching CSS crew data:', error);

        if (apiCache.cssInfo.data) {
            console.log('CSS fetch failed, returning cached data');
            return res.json(apiCache.cssInfo.data);
        }

        res.status(500).json({
            error: 'The crew data could not be retrieved.'
        });
    }
});

// Endpoint to get the expedition information from The Space Devs API, this one will have a parameter for the expedition ID
app.get('/api/expedition/:id', async (req, res) => {
    const expeditionId = req.params.id;
    try {
        const expeditionCacheEntry = apiCache.expeditions[expeditionId];
        const cachedExpedition = getCachedEntry(expeditionCacheEntry);
        if (cachedExpedition) {
            console.log(`Returning cached expedition data for ID ${expeditionId}`);
            return res.json(cachedExpedition);
        }

        const response = await fetch(`https://ll.thespacedevs.com/2.3.0/expeditions/${expeditionId}/`);
        const data = await response.json();

        apiCache.expeditions[expeditionId] = apiCache.expeditions[expeditionId] || { data: null, timestamp: null };
        setCachedEntry(apiCache.expeditions[expeditionId], data);

        console.log(`Fetched expedition data for ID ${expeditionId} and cached for 2 hours:`, data);

        res.json(data);
    } catch (error) {
        console.error(`Error fetching expedition data for ID ${expeditionId}:`, error);

        const expeditionCacheEntry = apiCache.expeditions[expeditionId];
        if (expeditionCacheEntry?.data) {
            console.log(`Expedition fetch failed for ID ${expeditionId}, returning cached data`);
            return res.json(expeditionCacheEntry.data);
        }

        res.status(500).json({
            error: 'The expedition data could not be retrieved.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`space-tracker API running on http://localhost:${PORT}`);
});