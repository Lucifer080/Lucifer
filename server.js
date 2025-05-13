const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const net = require("net");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());
let isSending = false;
// MySQL connection
const db = mysql.createConnection({
  host: "217.21.80.10",
  user: "u669256591_pusher",
  password: "Jaimik@@1602", // your MySQL root password
  database: "u669256591_pusher",
});
// const db = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "", // your MySQL root password
//   database: "vehicledb",
// });

const moment = require("moment-timezone");

// Set default timezones
const formatDateIST = moment.tz("Asia/Kolkata").format("DDMMYYYY");
const formatTimeUTC = moment.utc().format("HHmmss");

db.connect((err) => {
  if (err) throw err;
  console.log("Connected to MySQL");
  // fetchAndSendAll(); // Fetch and send all vehicle data on startup
});

// Start sending loop
app.get("/api/start", (req, res) => {
  if (isSending) {
    return res.json({ message: "Already sending" });
  }

  isSending = true;
  res.json({ message: "Started sending data..." });
  sendLoop();
});

app.get("/", (req, res) => {
    console.log("Hello");  
});


// Stop sending loop
app.get("/api/stop", (req, res) => {
  if (!isSending) {
    return res.json({ message: "Not currently sending" });
  }

  isSending = false;
  res.json({ message: "Stopping data send..." });
});

// Main loop
async function sendLoop() {
  const dbPromise = db.promise();

  while (isSending) {
    try {
      const [rows] = await dbPromise.query("SELECT * FROM vehicledetails");

      for (const vehicle of rows) {
        if (!isSending) break;

        await sendVehicle(vehicle);
        // await wait(3000); // Delay between vehicles
      }
    } catch (err) {
      console.error("❌ Error fetching data:", err.message);
      // isSending = false;
      break;
    }

    await wait(3000); // Wait before next full cycle
  }

  console.log("🔁 Sending loop stopped");
}

app.post("/api/settings", (req, res) => {
  const { lat, lng } = req.body;

  const query =
    "INSERT INTO settings (default_latitude, default_longitude) VALUES (?, ?)";
  db.query(query, [lat, lng], (err, result) => {
    if (err) {
      console.error("Insert error:", err);
      return res.status(500).json({ message: "Failed to insert data" });
    }
    res.json({ message: "Data inserted successfully" });
  });
});

const SERVER_IP = "103.234.162.150";
const SERVER_PORT = 5001;
// Send one vehicle's data
function sendVehicle(vehicle) {
  return new Promise((resolve) => {
    const {
      vehicle_no: vehicleNumber,
      imei_no: imei,
      latitude: lat,
      longitude: lng,
    } = vehicle;
    // console.log(lat)
    if (!vehicleNumber || !lat || !lng || !imei) {
      console.warn(`⚠️ Skipping incomplete data for ${vehicleNumber}`);
      return resolve();
    }

    const dataString = `\$NRM,WTEX,1.ONTC,NR,01,L,${imei},${vehicleNumber},1,${formatDateIST},${formatTimeUTC},${lat},N,${lng},E,0.0,229.84,27,0114.04,2.00,0.41,Vodafone,0,1,25.4,4.0,0,C,22,404,05,16c5,895b,16,16c5,8959,15,16c5,8aff,15,16c5,8afe,10,16c5,895a,0000,00,047834,5400.000,0.000,1450.092,()*D4`;

    const client = new net.Socket();
    console.log(dataString);

    client.connect(SERVER_PORT, SERVER_IP, () => {
      client.write(dataString);
      client.end();
      console.log(`📤 Sent: ${vehicleNumber}`);
      resolve();
    });

    client.on("error", (err) => {
      console.error(`❌ Socket error for ${vehicleNumber}: ${err.message}`);
      resolve();
    });
  });
}

// Delay function
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API to receive form data
app.post("/api/submit", (req, res) => {
  const {
    vehicleNo,
    imeiNo,
    agency,
    mobileNo,
    subagency,
    longitude,
    latitude,
    second,
    customername,
  } = req.body;

  const sql = `
  INSERT INTO vehicledetails (vehicle_no, imei_no, customer_name, mobile_no, agency, subagency, longitude, latitude, second_value)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

  db.query(
    sql,
    [
      vehicleNo,
      imeiNo,
      customername,
      mobileNo,
      agency,
      subagency,
      longitude,
      latitude,
      second,
    ],
    (err, result) => {
      if (err) {
        console.error("Insert error:", err);
        return res.status(500).json({ error: "Database insert failed" });
      }
      res.status(200).json({ message: "Data saved successfully" });
    }
  );
});

// Fetch all data
app.get("/api/vehicles", (req, res) => {
  db.query("SELECT * FROM vehicledetails", (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch data" });
    res.json(results);
  });
});

// Update a record
app.put("/api/vehicles/:id", (req, res) => {
  const { id } = req.params;
  const {
    vehicleNo,
    imeiNo,
    customername,
    mobileNo,
    agency,
    subagency,
    longitude,
    latitude,
    second,
  } = req.body;

  // Validate the data.  This is VERY important.
  if (!vehicleNo || !imeiNo || longitude === undefined || latitude === undefined) {
    return res.status(400).json({ error: "Missing required fields (vehicleNo, imeiNo, longitude, latitude)" });
  }

  const sql = `
    UPDATE vehicledetails 
    SET vehicle_no = ?, imei_no = ?, customer_name = ?, mobile_no = ?, agency = ?, subagency = ?, longitude = ?, latitude = ?, second_value = ? 
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      vehicleNo,
      imeiNo,
      customername,
      mobileNo,
      agency,
      subagency,
      longitude,
      latitude,
      second,
      id,
    ],
    (err, result) => {
      if (err) {
        console.error("Update error:", err);
        return res.status(500).json({ error: "Failed to update record", details: err.message }); // Include details
      }
      // Respond with a 200 even if no rows were changed.  This is typical for PUT.
      res.status(200).json({ message: "Record updated successfully", updated: result.affectedRows });
    }
  );
});

app.get("/api/vehicles/:id", (req, res) => {
  const { id } = req.params;

  // Validate the ID.
  if (!id || isNaN(id)) {
    return res.status(400).json({ error: "Invalid vehicle ID.  Must be a number." });
  }

  const sql = `
    SELECT 
      id,
      vehicle_no,
      imei_no,
      customer_name,
      mobile_no,
      agency,
      subagency,
      longitude,
      latitude,
      second_value AS second
    FROM vehicledetails
    WHERE id = ?
  `;

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error("Error fetching vehicle:", err);
      return res.status(500).json({ error: "Failed to fetch vehicle", details: err.message }); // Include details
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    // If found, send the vehicle data.
    res.status(200).json({
      status: "success",
      data: results, //  Return the array of results
    });
  });
});


app.put("/api/vehicles/batch-update", (req, res) => {
  const { ids, longitude, latitude } = req.body;

  if (!ids || !longitude || !latitude || ids.length === 0) {
    return res
      .status(400)
      .json({ error: "Missing required fields or no vehicles selected." });
  }

  const placeholders = ids.map(() => "?").join(","); // Create placeholders for vehicle IDs
  const sql = `
    UPDATE vehicledetails 
    SET longitude = ?, latitude = ?
    WHERE id IN (${placeholders})
  `;

  // Combine longitude, latitude, and all selected IDs for query
  const values = [longitude, latitude, ...ids];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Batch Update Error:", err);
      return res
        .status(500)
        .json({ error: "Failed to update selected vehicles" });
    }

    res.json({ message: "Selected vehicles updated successfully" });
  });
});

app.delete("/api/vehicles/:id", (req, res) => {
  const { id } = req.params;

  // SQL query to delete the vehicle with the specified id
  const sql = `DELETE FROM vehicledetails WHERE id = ?`;

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Delete Error:", err);
      return res.status(500).json({ error: "Failed to delete vehicle" });
    }

    // Check if any row was deleted
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    res.json({ message: "Vehicle deleted successfully" });
  });
});

app.post("/api/bulk-upload", async (req, res) => {
  const vehicles = req.body;

  if (!Array.isArray(vehicles)) {
    return res.status(400).json({ message: "Invalid data format" });
  }

  const sql = `
    INSERT INTO vehicledetails 
    (vehicle_no, imei_no, customer_name, mobile_no, agency, subagency, longitude, latitude, second_value) 
    VALUES ?
  `;

  const values = vehicles.map((v) => [
    v.vehicleNo,
    v.imeiNo,
    v.customername,
    v.mobileNo,
    v.agency,
    v.subagency,
    v.longitude,
    v.latitude,
    v.second,
  ]);

  try {
    const dbPromise = db.promise(); // get the promise wrapper
    await dbPromise.query(sql, [values]); // use async/await safely here
    res.json({ message: "Excel data inserted successfully" });
  } catch (err) {
    console.error("Bulk insert error:", err);
    res.status(500).json({ message: "Bulk insert failed" });
  }
});

app.post("/api/bulk-delete", async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "No vehicle IDs provided" });
  }

  const placeholders = ids.map(() => "?").join(", ");
  const sql = `DELETE FROM vehicledetails WHERE id IN (${placeholders})`;

  db.query(sql, ids, (err, result) => {
    if (err) {
      console.error("Bulk delete failed:", err);
      return res.status(500).json({ message: "Error deleting vehicles" });
    }

    res.json({ message: "Selected vehicles deleted", affectedRows: result.affectedRows });
  });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
