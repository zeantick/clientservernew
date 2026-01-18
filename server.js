const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к базе
const db = mysql.createPool({
    host: "d26893.mysql.zonevs.eu",
    user: "d26893_busstops",
    password: "3w7PYquFJhver0!KdOfF",
    database: "d26893_busstops",
    waitForConnections: true,
    connectionLimit: 10
}).promise();

// ───────── Stops autocomplete ─────────
app.get("/api/stops", async (req,res)=>{
    const q = `%${req.query.q || ""}%`;
    try {
        const [rows] = await db.query(
            `SELECT stop_id, stop_name 
             FROM ivan_stops 
             WHERE stop_name LIKE ? 
             ORDER BY stop_name 
             LIMIT 15`,
             [q]
        );
        res.json(rows.map(r=>({ label:r.stop_name, value:r.stop_name, stop_id:r.stop_id })));
    } catch(err){ res.status(500).json({ error: err.message }); }
});

// ───────── Buses for stop ─────────
app.get("/api/buses", async (req,res)=>{
    const stopId = req.query.stopId;
    if(!stopId) return res.json([]);
    try {
        const [rows] = await db.query(`
            SELECT DISTINCT r.route_short_name AS bus, t.trip_headsign AS direction, t.trip_id
            FROM ivan_stop_times st
            JOIN ivan_trips t ON st.trip_id = t.trip_id
            JOIN ivan_routes r ON t.route_id = r.route_id
            WHERE st.stop_id = ?
            ORDER BY CAST(r.route_short_name AS UNSIGNED), r.route_short_name
        `,[stopId]);
        res.json(rows);
    } catch(err){ res.status(500).json({ error: err.message }); }
});

// ───────── Next arrivals for a bus at stop ─────────
app.get("/api/arrivals", async (req,res)=>{
    const stopId = req.query.stopId;
    const tripIds = req.query.tripIds; // массив trip_id через запятую
    if(!stopId || !tripIds) return res.json([]);
    const tripIdArray = tripIds.split(",").map(id=>id.trim());
    try {
        const [rows] = await db.query(`
            SELECT st.arrival_time, t.trip_headsign, r.route_short_name AS bus
            FROM ivan_stop_times st
            JOIN ivan_trips t ON st.trip_id = t.trip_id
            JOIN ivan_routes r ON t.route_id = r.route_id
            WHERE st.stop_id = ? AND st.trip_id IN (?)
            ORDER BY st.arrival_time
            LIMIT 5
        `,[stopId, tripIdArray]);
        res.json(rows);
    } catch(err){ res.status(500).json({ error: err.message }); }
});

// ───────── Nearest stop by geolocation ─────────
app.get("/api/nearest_stop", async (req,res)=>{
    const { lat, lon } = req.query;
    if(!lat || !lon) return res.status(400).json({error:"Missing coordinates"});
    try {
        const [rows] = await db.query(`
            SELECT stop_id, stop_name,
            (6371 * acos(
                cos(radians(?)) * cos(radians(stop_lat)) *
                cos(radians(stop_lon)-radians(?)) +
                sin(radians(?)) * sin(radians(stop_lat))
            )) AS distance
            FROM ivan_stops
            ORDER BY distance
            LIMIT 1
        `,[lat, lon, lat]);
        res.json(rows[0]);
    } catch(err){ res.status(500).json({ error: err.message }); }
});

// ───────── Serve frontend ─────────
app.use(express.static(path.join(__dirname,"public")));

const PORT=3000;
app.listen(PORT, ()=>{ console.log(`Server running at http://localhost:${PORT}`); });
