const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Endpoint to get and clean TLEs from Celestrak
app.get('/api/tles', async (req, res) => {
    try {
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
            s.name.includes('ISS') || s.name.includes('CSS') || s.name.includes('TIANGONG')
        );

        res.json(activeMannedStations);
    } catch (error) {
        console.error('Error fetching TLEs:', error);
        res.status(500).json({
            error: 'The orbital data could not be retrieved.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`space-tracker API running on http://localhost:${PORT}`);
});